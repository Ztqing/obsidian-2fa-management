import assert from "node:assert/strict";
import test from "node:test";
import { VaultPersistedUnlockManager } from "../src/vault/persisted-unlock-manager";
import type {
	PersistedUnlockCapability,
	PersistedUnlockData,
	PluginData,
} from "../src/types";
import type { PersistedUnlockStorage } from "../src/security/persisted-unlock";

function createStoredData(overrides: Partial<PluginData> = {}): PluginData {
	return {
		schemaVersion: 1,
		persistedUnlock: null,
		vaultRevision: 1,
		vault: {
			version: 1,
			saltB64: "salt",
			ivB64: "iv",
			cipherTextB64: "cipher",
		},
		settings: {
			allowInsecurePersistedUnlockFallback: false,
			lockTimeoutMinutes: 15,
			lockTimeoutMode: "on-restart",
			preferredSide: "right",
			showUpcomingCodes: false,
		},
		...overrides,
	};
}

function createPersistedUnlockStorage(options: {
	availability?: PersistedUnlockCapability["availability"];
	source?: PersistedUnlockCapability["source"];
	unprotect?: (data: PersistedUnlockData) => string;
} = {}): PersistedUnlockStorage {
	return {
		getCapability: (storageOptions) => {
			if (
				(options.availability ?? "available") === "unavailable" &&
				storageOptions?.allowInsecureFallback
			) {
				return {
					availability: "insecure" as const,
					source: "compatibility-fallback" as const,
				};
			}

			const availability = options.availability ?? "available";
			return {
				availability,
				source:
					options.source ??
					(availability === "unavailable" ? "none" : "safe-storage"),
			};
		},
		protect: (password) => ({
			kind: "safe-storage",
			version: 2,
			protectedPasswordB64: `protected:${password}`,
		}),
		unprotect: (data) => {
			if (options.unprotect) {
				return options.unprotect(data);
			}

			if ("plainPassword" in data) {
				return data.plainPassword;
			}

			return data.protectedPasswordB64.replace(/^protected:/, "");
		},
	};
}

function createManager(options: {
	pluginData?: PluginData;
	persistedUnlockStorage?: PersistedUnlockStorage;
	sessionPassword?: string | null;
} = {}) {
	let pluginData = options.pluginData ?? createStoredData();
	const persistedSnapshots: PluginData[] = [];
	let sessionPassword: string | null =
		typeof options.sessionPassword === "undefined"
			? "vault-password"
			: options.sessionPassword;
	let didBegin = false;

	const manager = new VaultPersistedUnlockManager({
		decryptEntries: async () => [],
		persistedUnlockStorage:
			options.persistedUnlockStorage ?? createPersistedUnlockStorage(),
		repository: {
			createNextPluginData(next) {
				return {
					...pluginData,
					persistedUnlock:
						typeof next.persistedUnlock === "undefined"
							? pluginData.persistedUnlock
							: next.persistedUnlock,
					settings: next.settings ?? pluginData.settings,
				};
			},
			getLockTimeoutMode: () => pluginData.settings.lockTimeoutMode,
			getPersistedUnlock: () => pluginData.persistedUnlock,
			getPluginData: () => pluginData,
			getVaultLoadIssue: () => null,
			isInsecurePersistedUnlockFallbackEnabled: () =>
				pluginData.settings.allowInsecurePersistedUnlockFallback,
			isVaultInitialized: () => pluginData.vault !== null,
			async persistPluginData(nextData) {
				pluginData = structuredClone(nextData);
				persistedSnapshots.push(pluginData);
			},
			replacePluginData(nextData) {
				pluginData = structuredClone(nextData);
			},
		},
		session: {
			begin: () => {
				didBegin = true;
			},
			isUnlocked: () => sessionPassword !== null,
			requireSessionPassword: () => sessionPassword ?? "",
		},
	});

	return {
		didBegin: () => didBegin,
		getPluginData: () => pluginData,
		manager,
		persistedSnapshots,
		setSessionPassword(value: string | null) {
			sessionPassword = value;
		},
	};
}

test("VaultPersistedUnlockManager persists remembered unlock data when never mode is enabled", async () => {
	const { manager, persistedSnapshots } = createManager();

	await manager.setLockTimeoutMode("never");

	assert.equal(persistedSnapshots[0]?.settings.lockTimeoutMode, "never");
	assert.notEqual(persistedSnapshots[0]?.persistedUnlock, null);
});

test("VaultPersistedUnlockManager can disable compatibility fallback and downgrade never mode safely", async () => {
	const { manager, persistedSnapshots } = createManager({
		pluginData: createStoredData({
			persistedUnlock: {
				kind: "compatibility-fallback",
				plainPassword: "vault-password",
				version: 2,
			},
			settings: {
				allowInsecurePersistedUnlockFallback: true,
				lockTimeoutMinutes: 15,
				lockTimeoutMode: "never",
				preferredSide: "right",
				showUpcomingCodes: false,
			},
		}),
		persistedUnlockStorage: createPersistedUnlockStorage({
			availability: "unavailable",
		}),
	});

	await manager.setInsecurePersistedUnlockFallbackEnabled(false);

	assert.equal(
		persistedSnapshots[0]?.settings.allowInsecurePersistedUnlockFallback,
		false,
	);
	assert.equal(persistedSnapshots[0]?.settings.lockTimeoutMode, "on-restart");
	assert.equal(persistedSnapshots[0]?.persistedUnlock, null);
});

test("VaultPersistedUnlockManager restores remembered unlocks and clears invalid data on failure", async () => {
	const restorable = createManager({
		pluginData: createStoredData({
			persistedUnlock: {
				kind: "safe-storage",
				version: 2,
				protectedPasswordB64: "protected:vault-password",
			},
			settings: {
				allowInsecurePersistedUnlockFallback: false,
				lockTimeoutMinutes: 15,
				lockTimeoutMode: "never",
				preferredSide: "right",
				showUpcomingCodes: false,
			},
		}),
	});

	await restorable.manager.restorePersistedUnlockIfAvailable();
	assert.equal(restorable.didBegin(), true);

	const broken = createManager({
		pluginData: createStoredData({
			persistedUnlock: {
				kind: "safe-storage",
				version: 2,
				protectedPasswordB64: "protected:vault-password",
			},
			settings: {
				allowInsecurePersistedUnlockFallback: false,
				lockTimeoutMinutes: 15,
				lockTimeoutMode: "never",
				preferredSide: "right",
				showUpcomingCodes: false,
			},
		}),
		persistedUnlockStorage: createPersistedUnlockStorage({
			unprotect: () => {
				throw new Error("bad data");
			},
		}),
	});

	await broken.manager.restorePersistedUnlockIfAvailable();
	assert.equal(broken.getPluginData().persistedUnlock, null);
});
