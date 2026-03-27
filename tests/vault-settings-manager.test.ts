import assert from "node:assert/strict";
import test from "node:test";
import { VaultSettingsManager } from "../src/vault/settings-manager";
import type { PluginData } from "../src/types";

function createRepositoryHarness() {
	let pluginData: PluginData = {
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
		},
	};

	return {
		getPluginData: () => pluginData,
		repository: {
			async persistSettings(nextSettings: Partial<PluginData["settings"]>): Promise<void> {
				pluginData = {
					...pluginData,
					settings: {
						...pluginData.settings,
						...nextSettings,
					},
				};
			},
		},
	};
}

test("VaultSettingsManager persists sidebar and upcoming-code preferences", async () => {
	const { repository, getPluginData } = createRepositoryHarness();
	const persistSettings = async (
		nextSettings: Partial<PluginData["settings"]>,
	): Promise<void> => repository.persistSettings(nextSettings);
	const manager = new VaultSettingsManager({
		persistedUnlockManager: {
			assertAvailable: () => {},
			createPersistedUnlockData: () => null,
			getCapability: () => ({
				availability: "available" as const,
				source: "safe-storage" as const,
			}),
			getStorageOptions: () => ({
				allowInsecureFallback: false,
			}),
		},
		repository: {
			createNextPluginData: (options) => ({
				...getPluginData(),
				persistedUnlock:
					typeof options.persistedUnlock === "undefined"
						? getPluginData().persistedUnlock
						: options.persistedUnlock,
				settings: options.settings ?? getPluginData().settings,
				vault:
					typeof options.vault === "undefined"
						? getPluginData().vault
						: options.vault,
				vaultRevision: options.bumpVaultRevision
					? getPluginData().vaultRevision + 1
					: getPluginData().vaultRevision,
			}),
			getLockTimeoutMode: () => getPluginData().settings.lockTimeoutMode,
			getPersistedUnlock: () => getPluginData().persistedUnlock,
			getPluginData,
			getVaultLoadIssue: () => null,
			persistPluginData: async () => {},
			persistSettings,
		},
		session: {
			isUnlocked: () => false,
			requireSessionPassword: () => "vault-password",
		},
	});

	await manager.setPreferredSide("left");
	await manager.setShowUpcomingCodes(true);

	assert.equal(getPluginData().settings.preferredSide, "left");
	assert.equal(getPluginData().settings.showUpcomingCodes, true);
});

test("VaultSettingsManager validates custom lock timeout minutes before saving", async () => {
	const { repository, getPluginData } = createRepositoryHarness();
	const persistSettings = async (
		nextSettings: Partial<PluginData["settings"]>,
	): Promise<void> => repository.persistSettings(nextSettings);
	const manager = new VaultSettingsManager({
		persistedUnlockManager: {
			assertAvailable: () => {},
			createPersistedUnlockData: () => null,
			getCapability: () => ({
				availability: "available" as const,
				source: "safe-storage" as const,
			}),
			getStorageOptions: () => ({
				allowInsecureFallback: false,
			}),
		},
		repository: {
			createNextPluginData: (options) => ({
				...getPluginData(),
				persistedUnlock:
					typeof options.persistedUnlock === "undefined"
						? getPluginData().persistedUnlock
						: options.persistedUnlock,
				settings: options.settings ?? getPluginData().settings,
				vault:
					typeof options.vault === "undefined"
						? getPluginData().vault
						: options.vault,
				vaultRevision: options.bumpVaultRevision
					? getPluginData().vaultRevision + 1
					: getPluginData().vaultRevision,
			}),
			getLockTimeoutMode: () => getPluginData().settings.lockTimeoutMode,
			getPersistedUnlock: () => getPluginData().persistedUnlock,
			getPluginData,
			getVaultLoadIssue: () => null,
			persistPluginData: async () => {},
			persistSettings,
		},
		session: {
			isUnlocked: () => false,
			requireSessionPassword: () => "vault-password",
		},
	});

	await assert.rejects(async () => {
		await manager.setLockTimeoutMinutes(0);
	});

	await manager.setLockTimeoutMinutes(30);
	assert.equal(getPluginData().settings.lockTimeoutMinutes, 30);
});
