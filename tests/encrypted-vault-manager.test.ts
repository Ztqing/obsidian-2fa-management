import assert from "node:assert/strict";
import test from "node:test";
import { EncryptedVaultManager } from "../src/vault/encrypted-vault-manager";
import { VaultSession } from "../src/vault/session";
import type { PluginData } from "../src/types";

type PersistedUnlockData = NonNullable<PluginData["persistedUnlock"]>;

const baseVault: NonNullable<PluginData["vault"]> = {
	version: 1,
	saltB64: "salt",
	ivB64: "iv",
	cipherTextB64: "cipher",
};

function createPersistedUnlockData(kind = "safe-storage"): PersistedUnlockData {
	return kind === "compatibility-fallback"
		? {
				kind: "compatibility-fallback",
				plainPassword: "vault-password",
				version: 2,
			}
		: {
				kind: "safe-storage",
				version: 2,
				protectedPasswordB64: "protected",
			};
}

function createRepositoryHarness(initialData: PluginData = {
	schemaVersion: 1,
	persistedUnlock: null,
	vaultRevision: 0,
	vault: null,
	settings: {
		allowInsecurePersistedUnlockFallback: false,
		lockTimeoutMinutes: 15,
		lockTimeoutMode: "on-restart",
		preferredSide: "right",
		showUpcomingCodes: false,
	},
}) {
	let pluginData = structuredClone(initialData);
	const persistedSnapshots: PluginData[] = [];

	return {
		persistedSnapshots,
		repository: {
			createNextPluginData(options: {
				bumpVaultRevision?: boolean;
				persistedUnlock?: PluginData["persistedUnlock"];
				vault?: PluginData["vault"];
			}): PluginData {
				return {
					...pluginData,
					persistedUnlock:
						typeof options.persistedUnlock === "undefined"
							? pluginData.persistedUnlock
							: options.persistedUnlock,
					vault:
						typeof options.vault === "undefined" ? pluginData.vault : options.vault,
					vaultRevision: options.bumpVaultRevision
						? pluginData.vaultRevision + 1
						: pluginData.vaultRevision,
				};
			},
			getPluginData(): PluginData {
				return pluginData;
			},
			async persistPluginData(nextData: PluginData): Promise<void> {
				pluginData = structuredClone(nextData);
				persistedSnapshots.push(pluginData);
			},
		},
	};
}

test("EncryptedVaultManager initialize persists an encrypted vault and opens a session", async () => {
	const session = new VaultSession();
	const { repository, persistedSnapshots } = createRepositoryHarness();
	const manager = new EncryptedVaultManager(repository as never, session);

	await manager.initialize("vault-password", {
		persistedUnlock: createPersistedUnlockData(),
	});

	assert.equal(persistedSnapshots.length, 1);
	assert.equal(persistedSnapshots[0]?.vaultRevision, 1);
	assert.notEqual(persistedSnapshots[0]?.vault, null);
	assert.deepEqual(persistedSnapshots[0]?.persistedUnlock, createPersistedUnlockData());
	assert.equal(session.isUnlocked(), true);
	assert.deepEqual(session.getEntries(), []);
});

test("EncryptedVaultManager changeMasterPassword re-encrypts the current session while preserving entries", async () => {
	const session = new VaultSession();
	session.begin(
		[
			{
				id: "entry-1",
				sortOrder: 0,
				accountName: "name@example.com",
				algorithm: "SHA-1",
				digits: 6,
				issuer: "GitHub",
				period: 30,
				secret: "JBSWY3DPEHPK3PXP",
			},
		],
		"old-password",
	);

	const { repository, persistedSnapshots } = createRepositoryHarness({
		schemaVersion: 1,
		persistedUnlock: null,
		vaultRevision: 3,
		vault: baseVault,
		settings: {
			allowInsecurePersistedUnlockFallback: false,
			lockTimeoutMinutes: 15,
			lockTimeoutMode: "on-restart",
			preferredSide: "right",
			showUpcomingCodes: false,
		},
	});
	const manager = new EncryptedVaultManager(repository as never, session);

	await manager.changeMasterPassword("new-password", {
		persistedUnlock: createPersistedUnlockData("compatibility-fallback"),
	});

	assert.equal(persistedSnapshots[0]?.vaultRevision, 4);
	assert.deepEqual(persistedSnapshots[0]?.persistedUnlock, createPersistedUnlockData("compatibility-fallback"));
	assert.equal(session.requireSessionPassword(), "new-password");
	assert.equal(session.getEntries()[0]?.accountName, "name@example.com");
});

test("EncryptedVaultManager commitUnlockedEntries reindexes sort order before syncing the session", async () => {
	const session = new VaultSession();
	session.begin(
		[
			{
				id: "entry-1",
				sortOrder: 5,
				accountName: "first@example.com",
				algorithm: "SHA-1",
				digits: 6,
				issuer: "GitHub",
				period: 30,
				secret: "JBSWY3DPEHPK3PXP",
			},
			{
				id: "entry-2",
				sortOrder: 9,
				accountName: "second@example.com",
				algorithm: "SHA-1",
				digits: 6,
				issuer: "GitLab",
				period: 30,
				secret: "ABCDEFGHIJKLMNOP",
			},
		],
		"vault-password",
	);

	const { repository, persistedSnapshots } = createRepositoryHarness({
		schemaVersion: 1,
		persistedUnlock: null,
		vaultRevision: 2,
		vault: baseVault,
		settings: {
			allowInsecurePersistedUnlockFallback: false,
			lockTimeoutMinutes: 15,
			lockTimeoutMode: "on-restart",
			preferredSide: "right",
			showUpcomingCodes: false,
		},
	});
	const manager = new EncryptedVaultManager(repository as never, session);

	await manager.commitUnlockedEntries([...session.getEntries()].reverse(), {
		bumpVaultRevision: true,
	});

	assert.equal(persistedSnapshots[0]?.vaultRevision, 3);
	assert.deepEqual(
		session.getEntries().map((entry) => [entry.id, entry.sortOrder]),
		[
			["entry-2", 0],
			["entry-1", 1],
		],
	);
});

test("EncryptedVaultManager resetVault clears the session and only bumps the revision when needed", async () => {
	const session = new VaultSession();
	session.begin([], "vault-password");

	const { repository, persistedSnapshots } = createRepositoryHarness({
		schemaVersion: 1,
		persistedUnlock: createPersistedUnlockData(),
		vaultRevision: 5,
		vault: baseVault,
		settings: {
			allowInsecurePersistedUnlockFallback: false,
			lockTimeoutMinutes: 15,
			lockTimeoutMode: "on-restart",
			preferredSide: "right",
			showUpcomingCodes: false,
		},
	});
	const manager = new EncryptedVaultManager(repository as never, session);

	await manager.resetVault();

	assert.equal(persistedSnapshots[0]?.vaultRevision, 6);
	assert.equal(persistedSnapshots[0]?.vault, null);
	assert.equal(persistedSnapshots[0]?.persistedUnlock, null);
	assert.equal(session.isUnlocked(), false);
});
