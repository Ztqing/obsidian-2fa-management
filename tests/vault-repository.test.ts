import assert from "node:assert/strict";
import test from "node:test";
import { VaultRepository } from "../src/vault/repository";
import type { PluginData } from "../src/types";

function createStoredData(overrides: Partial<PluginData> = {}): PluginData {
	const {
		settings: settingsOverride,
		...restOverrides
	} = overrides;

	return {
		schemaVersion: 1,
		persistedUnlock: null,
		vaultRevision: 1,
		vault: null,
		settings: {
			allowInsecurePersistedUnlockFallback: false,
			lockTimeoutMinutes: 15,
			lockTimeoutMode: "on-restart",
			preferredSide: "right",
			showUpcomingCodes: false,
			...(settingsOverride ?? {}),
		},
		...restOverrides,
	};
}

test("VaultRepository loads normalized plugin data and exposes derived settings", async () => {
	const repository = new VaultRepository({
		loadData: async () => ({
			schemaVersion: 1,
			vaultRevision: 4,
			vault: null,
			settings: {
				preferredSide: "left",
				lockTimeoutMode: "custom",
				lockTimeoutMinutes: 22,
				showUpcomingCodes: true,
				allowInsecurePersistedUnlockFallback: true,
			},
		}),
		saveData: async () => {
			throw new Error("save should not run during load");
		},
	});

	await repository.load();

	assert.equal(repository.getVaultLoadIssue(), null);
	assert.equal(repository.isVaultInitialized(), false);
	assert.equal(repository.getVaultRevision(), 4);
	assert.equal(repository.getPreferredSide(), "left");
	assert.equal(repository.getLockTimeoutMode(), "custom");
	assert.equal(repository.getLockTimeoutMinutes(), 22);
	assert.equal(repository.shouldShowUpcomingCodes(), true);
	assert.equal(repository.isInsecurePersistedUnlockFallbackEnabled(), true);
});

test("VaultRepository keeps the current snapshot unchanged when persistence fails", async () => {
	const repository = new VaultRepository({
		loadData: async () => createStoredData(),
		saveData: async () => {
			throw new Error("disk full");
		},
	});

	await repository.load();
	const originalSnapshot = repository.getPluginData();

	await assert.rejects(async () => {
		await repository.persistSettings({
			preferredSide: "left",
		});
	});

	assert.deepEqual(repository.getPluginData(), originalSnapshot);
	assert.equal(repository.getPreferredSide(), "right");
});

test("VaultRepository createNextPluginData preserves unspecified fields and bumps revisions on demand", async () => {
	const repository = new VaultRepository({
		loadData: async () =>
			createStoredData({
				persistedUnlock: {
					kind: "safe-storage",
					version: 2,
					protectedPasswordB64: "protected",
				},
				vault: {
					version: 1,
					saltB64: "salt",
					ivB64: "iv",
					cipherTextB64: "cipher",
				},
				vaultRevision: 7,
			}),
		saveData: async () => {},
	});

	await repository.load();

	const nextData = repository.createNextPluginData({
		bumpVaultRevision: true,
		settings: {
			...repository.getPluginData().settings,
			preferredSide: "left",
		},
	});

	assert.equal(nextData.vaultRevision, 8);
	assert.equal(nextData.settings.preferredSide, "left");
	assert.deepEqual(nextData.persistedUnlock, repository.getPersistedUnlock());
	assert.deepEqual(nextData.vault, repository.getPluginData().vault);
});
