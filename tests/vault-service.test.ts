import assert from "node:assert/strict";
import test from "node:test";
import { createBulkOtpauthImportPreview } from "../src/import/bulk-otpauth";
import type { PersistedUnlockStorage } from "../src/security/persisted-unlock";
import type {
	PersistedUnlockCapability,
	PersistedUnlockData,
	PluginData,
	TotpEntryDraft,
} from "../src/types";
import { TwoFactorVaultService } from "../src/vault/service";

const baseDraft: TotpEntryDraft = {
	accountName: "name@example.com",
	algorithm: "SHA-1",
	digits: 6,
	issuer: "GitHub",
	period: 30,
	secret: "JBSWY3DPEHPK3PXP",
};

function createService(
	initialData: unknown = null,
	options: {
		decryptEntries?: (
			encryptedVault: NonNullable<PluginData["vault"]>,
			password: string,
		) => Promise<ReturnType<TwoFactorVaultService["getEntries"]>>;
		onSaveData?: (data: PluginData) => Promise<void>;
		persistedUnlockStorage?: PersistedUnlockStorage;
	} = {},
) {
	const savedSnapshots: PluginData[] = [];
	let idCounter = 0;

	const service = new TwoFactorVaultService({
		createId: () => `entry-${++idCounter}`,
		decryptEntries: options.decryptEntries,
		loadData: async () => initialData,
		persistedUnlockStorage: options.persistedUnlockStorage,
		saveData: async (data) => {
			const snapshot = structuredClone(data);
			await options.onSaveData?.(snapshot);
			savedSnapshots.push(snapshot);
		},
	});

	return {
		savedSnapshots,
		service,
	};
}

function createPersistedUnlockStorage(options: {
	availability?: PersistedUnlockCapability["availability"];
	source?: PersistedUnlockCapability["source"];
	protect?: (
		password: string,
		capability: PersistedUnlockCapability,
	) => PersistedUnlockData;
	unprotect?: (
		data: PersistedUnlockData,
		capability: PersistedUnlockCapability,
	) => string;
} = {}): PersistedUnlockStorage {
	const resolveCapability = (
		storageOptions?: {
			allowInsecureFallback: boolean;
		},
	): PersistedUnlockCapability => {
		if (
			(options.availability ?? "available") === "unavailable" &&
			storageOptions?.allowInsecureFallback
		) {
			return {
				availability: "insecure",
				source: "compatibility-fallback",
			};
		}

		const availability = options.availability ?? "available";
		return {
			availability,
			source:
				options.source ??
				(availability === "unavailable" ? "none" : "safe-storage"),
		};
	};

	return {
		getCapability: (storageOptions) => resolveCapability(storageOptions),
		protect: (password, storageOptions) => {
			const capability = resolveCapability(storageOptions);

			if (capability.availability === "unavailable") {
				throw new Error("persisted_unlock_backend_unavailable");
			}

			return (
				options.protect?.(password, capability) ??
				(capability.source === "compatibility-fallback"
					? {
							kind: "compatibility-fallback",
							plainPassword: password,
							version: 2,
						}
					: {
							kind: "safe-storage",
							version: 2,
							protectedPasswordB64: `protected:${password}`,
						})
			);
		},
		unprotect: (data, storageOptions) => {
			const capability = resolveCapability(storageOptions);

			if (options.unprotect) {
				return options.unprotect(data, capability);
			}

			if ("plainPassword" in data) {
				if (!storageOptions?.allowInsecureFallback) {
					throw new Error("persisted_unlock_backend_unavailable");
				}

				return data.plainPassword;
			}

			if (capability.availability === "unavailable") {
				throw new Error("persisted_unlock_backend_unavailable");
			}

			return data.protectedPasswordB64.replace(/^protected:/, "");
		},
	};
}

async function flushServiceWrites(service: TwoFactorVaultService): Promise<void> {
	await service.setPreferredSide(service.getPreferredSide());
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});

	return {
		promise,
		reject,
		resolve,
	};
}

function createStoredVaultData(
	overrides: Partial<PluginData> = {},
): PluginData {
	const {
		persistedUnlock = null,
		settings: overrideSettings,
		...restOverrides
	} = overrides;
	const defaultSettings: PluginData["settings"] = {
		allowInsecurePersistedUnlockFallback: false,
		lockTimeoutMinutes: 15,
		lockTimeoutMode: "on-restart",
		preferredSide: "right",
		showUpcomingCodes: false,
	};

	return {
		schemaVersion: 1,
		persistedUnlock,
		vaultRevision: 1,
		vault: {
			version: 1,
			saltB64: "c2FsdC1zYWx0LXNhbHQtcw==",
			ivB64: "aXYtaXYtaXYtaXY=",
			cipherTextB64: "Y2lwaGVyLXRleHQtYmxvY2s=",
		},
		...restOverrides,
		settings: { ...defaultSettings, ...(overrideSettings ?? {}) },
	};
}

test("TwoFactorVaultService initializes, locks, and unlocks the vault", async () => {
	const { savedSnapshots, service } = createService();

	await service.load();
	assert.equal(service.isVaultInitialized(), false);
	assert.equal(service.isUnlocked(), false);
	assert.equal(service.hasVaultLoadIssue(), false);

	await service.initializeVault("vault-password");
	assert.equal(service.isVaultInitialized(), true);
	assert.equal(service.isUnlocked(), true);
	assert.equal(savedSnapshots.at(-1)?.vault !== null, true);

	service.lockVault();
	assert.equal(service.isUnlocked(), false);
	assert.deepEqual(service.getEntries(), []);

	await service.unlockVault("vault-password");
	assert.equal(service.isUnlocked(), true);
	assert.deepEqual(service.getEntries(), []);
});

test("TwoFactorVaultService flags unreadable vault data and clears the repair state after reset", async () => {
	const { service } = createService({
		schemaVersion: 1,
		settings: {},
		vault: {
			version: 1,
			saltB64: 123,
		},
		vaultRevision: 4,
	});

	await service.load();

	assert.equal(service.hasVaultLoadIssue(), true);
	assert.equal(service.getVaultLoadIssue(), "corrupted");
	assert.equal(service.isVaultInitialized(), false);

	await assert.rejects(
		async () => {
			await service.initializeVault("vault-password");
		},
		(error: unknown) =>
			error instanceof Error &&
			"code" in error &&
			error.code === "vault_repair_required",
	);

	await service.resetVault();

	assert.equal(service.hasVaultLoadIssue(), false);
	assert.equal(service.getVaultLoadIssue(), null);
	assert.equal(service.isVaultInitialized(), false);
});

test("TwoFactorVaultService flags unsupported stored schema versions", async () => {
	const { service } = createService({
		schemaVersion: 99,
		settings: {},
		vault: null,
		vaultRevision: 1,
	});

	await service.load();

	assert.equal(service.hasVaultLoadIssue(), true);
	assert.equal(service.getVaultLoadIssue(), "unsupported_version");
});

test("TwoFactorVaultService persists add, update, delete, and reorder operations", async () => {
	const { service } = createService();

	await service.load();
	await service.initializeVault("vault-password");
	await service.addEntry(baseDraft);
	await service.addEntry({
		...baseDraft,
		accountName: "secondary@example.com",
		issuer: "GitLab",
	});

	let entries = service.getEntries();
	assert.deepEqual(
		entries.map((entry) => entry.id),
		["entry-1", "entry-2"],
	);

	const revisionBeforeEdit = service.getVaultRevision();
	await service.updateEntry(
		"entry-1",
		{
			...baseDraft,
			accountName: "updated@example.com",
		},
		revisionBeforeEdit,
	);
	entries = service.getEntries();
	assert.equal(entries[0]?.accountName, "updated@example.com");

	await service.reorderEntriesByIds(["entry-2", "entry-1"]);
	entries = service.getEntries();
	assert.deepEqual(
		entries.map((entry) => [entry.id, entry.sortOrder]),
		[
			["entry-2", 0],
			["entry-1", 1],
		],
	);

	await service.deleteEntry("entry-2");
	entries = service.getEntries();
	assert.deepEqual(entries.map((entry) => entry.id), ["entry-1"]);

	await service.deleteEntries(["entry-1"]);
	assert.deepEqual(service.getEntries(), []);
});

test("TwoFactorVaultService re-encrypts entries when the master password changes", async () => {
	const { service } = createService();

	await service.load();
	await service.initializeVault("original-password");
	await service.addEntry(baseDraft);
	await service.changeMasterPassword("next-password");
	service.lockVault();

	await assert.rejects(
		async () => {
			await service.unlockVault("original-password");
		},
	);

	await service.unlockVault("next-password");
	assert.equal(service.getEntries()[0]?.accountName, baseDraft.accountName);
});

test("TwoFactorVaultService commits bulk import results and preserves replacement ids", async () => {
	const { service } = createService();

	await service.load();
	await service.initializeVault("vault-password");
	await service.addEntry(baseDraft);

	const preview = createBulkOtpauthImportPreview(
		[
			"otpauth://totp/GitHub:name@example.com?secret=ABCDEFGHIJKLMNOP",
			"otpauth://totp/Linear:person@example.com?secret=QRSTUVWXYZ234567",
		].join("\n"),
		{
			existingEntries: service.getEntries(),
			formatErrorMessage: (error) =>
				error instanceof Error ? error.message : String(error),
		},
	);

	const commitResult = await service.commitBulkImport({
		expectedVaultRevision: service.getVaultRevision(),
		preview,
		selectedDuplicateLineNumbers: [1],
	});
	const entries = service.getEntries();

	assert.equal(commitResult.replacedEntries.length, 1);
	assert.equal(commitResult.addedEntries.length, 1);
	assert.equal(entries.length, 2);
	assert.equal(entries[0]?.id, "entry-1");
	assert.equal(entries[0]?.secret, "ABCDEFGHIJKLMNOP");
	assert.equal(entries[1]?.issuer, "Linear");
});

test("TwoFactorVaultService keeps unlocked entries unchanged when persistence fails", async () => {
	let saveAttemptCount = 0;
	const { savedSnapshots, service } = createService(null, {
		onSaveData: async () => {
			saveAttemptCount += 1;
			if (saveAttemptCount === 2) {
				throw new Error("disk full");
			}
		},
	});

	await service.load();
	await service.initializeVault("vault-password");
	const revisionBeforeFailure = service.getVaultRevision();

	await assert.rejects(async () => {
		await service.addEntry(baseDraft);
	});

	assert.equal(service.isUnlocked(), true);
	assert.equal(service.getVaultRevision(), revisionBeforeFailure);
	assert.deepEqual(service.getEntries(), []);
	assert.equal(savedSnapshots.length, 1);
});

test("TwoFactorVaultService keeps settings unchanged when persistence fails", async () => {
	const { service } = createService(null, {
		onSaveData: async () => {
			throw new Error("settings write failed");
		},
	});

	await service.load();

	await assert.rejects(async () => {
		await service.setPreferredSide("left");
	});

	assert.equal(service.getPreferredSide(), "right");
	assert.equal(service.shouldShowUpcomingCodes(), false);
});

test("TwoFactorVaultService restores unlock across restarts when lock timeout mode is never", async () => {
	const persistedUnlockStorage = createPersistedUnlockStorage();
	const { savedSnapshots, service } = createService(null, {
		persistedUnlockStorage,
	});

	await service.load();
	await service.initializeVault("vault-password");
	await service.setLockTimeoutMode("never");

	const restartedSnapshot = savedSnapshots.at(-1);
	assert.ok(restartedSnapshot);

	const restarted = createService(restartedSnapshot, {
		persistedUnlockStorage,
	});
	await restarted.service.load();

	assert.equal(restarted.service.getLockTimeoutMode(), "never");
	assert.equal(restarted.service.isUnlocked(), true);
});

test("TwoFactorVaultService restores unlock across restarts when storage is insecure", async () => {
	const persistedUnlockStorage = createPersistedUnlockStorage({
		availability: "insecure",
	});
	const { savedSnapshots, service } = createService(null, {
		persistedUnlockStorage,
	});

	await service.load();
	await service.initializeVault("vault-password");
	await service.setLockTimeoutMode("never");

	const restartedSnapshot = savedSnapshots.at(-1);
	assert.ok(restartedSnapshot?.persistedUnlock);

	const restarted = createService(restartedSnapshot, {
		persistedUnlockStorage,
	});
	await restarted.service.load();

	assert.deepEqual(restarted.service.getPersistedUnlockCapability(), {
		availability: "insecure",
		source: "safe-storage",
	});
	assert.equal(restarted.service.isUnlocked(), true);
});

test("TwoFactorVaultService restores unlock across restarts through the explicit compatibility fallback", async () => {
	const persistedUnlockStorage = createPersistedUnlockStorage({
		availability: "unavailable",
	});
	const { savedSnapshots, service } = createService(null, {
		persistedUnlockStorage,
	});

	await service.load();
	await service.initializeVault("vault-password");
	await service.setInsecurePersistedUnlockFallbackEnabled(true);
	await service.setLockTimeoutMode("never");

	const restartedSnapshot = savedSnapshots.at(-1);
	assert.deepEqual(restartedSnapshot?.persistedUnlock, {
		kind: "compatibility-fallback",
		plainPassword: "vault-password",
		version: 2,
	});

	const restarted = createService(restartedSnapshot, {
		persistedUnlockStorage,
	});
	await restarted.service.load();

	assert.deepEqual(restarted.service.getPersistedUnlockCapability(), {
		availability: "insecure",
		source: "compatibility-fallback",
	});
	assert.equal(restarted.service.isUnlocked(), true);
});

test("TwoFactorVaultService clears persisted unlock on manual lock and restores it after the next unlock", async () => {
	const persistedUnlockStorage = createPersistedUnlockStorage();
	const { savedSnapshots, service } = createService(null, {
		persistedUnlockStorage,
	});

	await service.load();
	await service.initializeVault("vault-password");
	await service.setLockTimeoutMode("never");
	assert.notEqual(savedSnapshots.at(-1)?.persistedUnlock, null);

	service.lockVault();
	await flushServiceWrites(service);

	assert.equal(service.getLockTimeoutMode(), "never");
	assert.equal(savedSnapshots.at(-1)?.persistedUnlock, null);

	await service.unlockVault("vault-password");
	await flushServiceWrites(service);

	assert.notEqual(savedSnapshots.at(-1)?.persistedUnlock, null);
});

test("TwoFactorVaultService clears persisted unlock when switching away from never", async () => {
	const persistedUnlockStorage = createPersistedUnlockStorage();
	const { savedSnapshots, service } = createService(null, {
		persistedUnlockStorage,
	});

	await service.load();
	await service.initializeVault("vault-password");
	await service.setLockTimeoutMode("never");

	assert.notEqual(savedSnapshots.at(-1)?.persistedUnlock, null);

	await service.setLockTimeoutMode("on-restart");

	assert.equal(service.getLockTimeoutMode(), "on-restart");
	assert.equal(savedSnapshots.at(-1)?.persistedUnlock, null);
});

test("TwoFactorVaultService refreshes persisted unlock data after a password change", async () => {
	const persistedUnlockStorage = createPersistedUnlockStorage();
	const { savedSnapshots, service } = createService(null, {
		persistedUnlockStorage,
	});

	await service.load();
	await service.initializeVault("original-password");
	await service.setLockTimeoutMode("never");
	await service.changeMasterPassword("next-password");

	const restartedSnapshot = savedSnapshots.at(-1);
	assert.ok(restartedSnapshot);

	const restarted = createService(restartedSnapshot, {
		persistedUnlockStorage,
	});
	await restarted.service.load();

	assert.equal(restarted.service.isUnlocked(), true);

	restarted.service.lockVault();
	await flushServiceWrites(restarted.service);

	await assert.rejects(async () => {
		await restarted.service.unlockVault("original-password");
	});

	await restarted.service.unlockVault("next-password");
});

test("TwoFactorVaultService clears bad remembered unlock data after auto-unlock fails", async () => {
	const persistedUnlockStorage = createPersistedUnlockStorage({
		unprotect: () => "wrong-password",
	});
	const { savedSnapshots, service } = createService(
		createStoredVaultData({
			persistedUnlock: {
				version: 1,
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
		{
			decryptEntries: async (_encryptedVault, password) => {
				if (password !== "vault-password") {
					throw new Error("wrong password");
				}

				return [];
			},
			persistedUnlockStorage,
		},
	);

	await service.load();

	assert.equal(service.hasVaultLoadIssue(), false);
	assert.equal(service.isUnlocked(), false);
	assert.equal(service.getLockTimeoutMode(), "never");
	assert.equal(savedSnapshots.at(-1)?.persistedUnlock, null);
});

test("TwoFactorVaultService skips auto-unlock when storage is unavailable without clearing data", async () => {
	const persistedUnlockStorage = createPersistedUnlockStorage({
		availability: "unavailable",
	});
	const initialData = createStoredVaultData({
		persistedUnlock: {
			version: 1,
			protectedPasswordB64: "protected:vault-password",
		},
		settings: {
			allowInsecurePersistedUnlockFallback: false,
			lockTimeoutMinutes: 15,
			lockTimeoutMode: "never",
			preferredSide: "right",
			showUpcomingCodes: false,
		},
	});
	const { savedSnapshots, service } = createService(initialData, {
		persistedUnlockStorage,
	});

	await service.load();

	assert.deepEqual(service.getPersistedUnlockCapability(), {
		availability: "unavailable",
		source: "none",
	});
	assert.equal(service.isUnlocked(), false);
	assert.equal(savedSnapshots.length, 0);
});

test("TwoFactorVaultService requires explicit compatibility mode before enabling never on unavailable desktops", async () => {
	const persistedUnlockStorage = createPersistedUnlockStorage({
		availability: "unavailable",
	});
	const { service } = createService(null, {
		persistedUnlockStorage,
	});

	await service.load();
	await service.initializeVault("vault-password");

	assert.deepEqual(service.getPersistedUnlockCapability(), {
		availability: "unavailable",
		source: "none",
	});
	await assert.rejects(
		async () => {
			await service.setLockTimeoutMode("never");
		},
		(error: unknown) =>
			error instanceof Error &&
			"code" in error &&
			error.code === "persisted_unlock_compatibility_mode_required",
	);
	assert.equal(service.getLockTimeoutMode(), "on-restart");
});

test("TwoFactorVaultService disables never and clears compatibility fallback data when the explicit fallback is turned off", async () => {
	const persistedUnlockStorage = createPersistedUnlockStorage({
		availability: "unavailable",
	});
	const { savedSnapshots, service } = createService(null, {
		persistedUnlockStorage,
	});

	await service.load();
	await service.initializeVault("vault-password");
	await service.setInsecurePersistedUnlockFallbackEnabled(true);
	await service.setLockTimeoutMode("never");

	assert.notEqual(savedSnapshots.at(-1)?.persistedUnlock, null);

	await service.setInsecurePersistedUnlockFallbackEnabled(false);

	assert.equal(service.isInsecurePersistedUnlockFallbackEnabled(), false);
	assert.equal(service.getLockTimeoutMode(), "on-restart");
	assert.equal(savedSnapshots.at(-1)?.persistedUnlock, null);
});

test("TwoFactorVaultService ignores unlock completion after a manual lock", async () => {
	const deferredUnlock = createDeferred<ReturnType<TwoFactorVaultService["getEntries"]>>();
	const { service } = createService(createStoredVaultData(), {
		decryptEntries: async () => deferredUnlock.promise,
	});

	await service.load();

	const unlockPromise = service.unlockVault("vault-password");
	await Promise.resolve();
	service.lockVault();
	deferredUnlock.resolve([
		{
			id: "entry-1",
			sortOrder: 0,
			...baseDraft,
		},
	]);
	await unlockPromise;

	assert.equal(service.isUnlocked(), false);
	assert.deepEqual(service.getEntries(), []);
});

test("TwoFactorVaultService ignores unlock completion after resetting the vault", async () => {
	const deferredUnlock = createDeferred<ReturnType<TwoFactorVaultService["getEntries"]>>();
	const { service } = createService(createStoredVaultData(), {
		decryptEntries: async () => deferredUnlock.promise,
	});

	await service.load();

	const unlockPromise = service.unlockVault("vault-password");
	await Promise.resolve();
	await service.resetVault();
	deferredUnlock.resolve([
		{
			id: "entry-1",
			sortOrder: 0,
			...baseDraft,
		},
	]);
	await unlockPromise;

	assert.equal(service.isVaultInitialized(), false);
	assert.equal(service.isUnlocked(), false);
	assert.deepEqual(service.getEntries(), []);
});

test("TwoFactorVaultService only applies the latest overlapping unlock attempt", async () => {
	const firstUnlock = createDeferred<ReturnType<TwoFactorVaultService["getEntries"]>>();
	const secondUnlock = createDeferred<ReturnType<TwoFactorVaultService["getEntries"]>>();
	let unlockCallCount = 0;
	const { service } = createService(createStoredVaultData(), {
		decryptEntries: async () => {
			unlockCallCount += 1;
			return unlockCallCount === 1
				? firstUnlock.promise
				: secondUnlock.promise;
		},
	});

	await service.load();

	const firstUnlockPromise = service.unlockVault("vault-password");
	const secondUnlockPromise = service.unlockVault("vault-password");

	firstUnlock.resolve([
		{
			id: "stale-entry",
			sortOrder: 0,
			...baseDraft,
		},
	]);
	await firstUnlockPromise;

	assert.equal(service.isUnlocked(), false);
	assert.deepEqual(service.getEntries(), []);

	secondUnlock.resolve([
		{
			id: "fresh-entry",
			sortOrder: 0,
			...baseDraft,
			accountName: "fresh@example.com",
		},
	]);
	await secondUnlockPromise;

	assert.equal(service.isUnlocked(), true);
	assert.deepEqual(service.getEntries().map((entry) => entry.id), ["fresh-entry"]);
	assert.equal(service.getEntries()[0]?.accountName, "fresh@example.com");
});

test("TwoFactorVaultService rejects stale edit submissions", async () => {
	const { service } = createService();

	await service.load();
	await service.initializeVault("vault-password");
	await service.addEntry(baseDraft);
	const staleRevision = service.getVaultRevision();
	await service.addEntry({
		...baseDraft,
		accountName: "fresh@example.com",
		issuer: "Linear",
	});

	await assert.rejects(
		async () => {
			await service.updateEntry(
				"entry-1",
				{
					...baseDraft,
					accountName: "stale@example.com",
				},
				staleRevision,
			);
		},
		(error: unknown) =>
			error instanceof Error &&
			"code" in error &&
			error.code === "entry_changed_during_edit",
	);

	assert.equal(service.getEntries()[0]?.accountName, baseDraft.accountName);
});

test("TwoFactorVaultService rejects edits for missing entries", async () => {
	const { service } = createService();

	await service.load();
	await service.initializeVault("vault-password");

	await assert.rejects(
		async () => {
			await service.updateEntry(
				"entry-404",
				{
					...baseDraft,
					accountName: "missing@example.com",
				},
				service.getVaultRevision(),
			);
		},
		(error: unknown) =>
			error instanceof Error && "code" in error && error.code === "entry_not_found",
	);
});

test("TwoFactorVaultService rejects stale bulk import previews", async () => {
	const { service } = createService();

	await service.load();
	await service.initializeVault("vault-password");
	await service.addEntry(baseDraft);

	const preview = createBulkOtpauthImportPreview(
		"otpauth://totp/Linear:person@example.com?secret=QRSTUVWXYZ234567",
		{
			existingEntries: service.getEntries(),
			formatErrorMessage: (error) =>
				error instanceof Error ? error.message : String(error),
		},
	);
	const expectedVaultRevision = service.getVaultRevision();

	await service.addEntry({
		...baseDraft,
		accountName: "fresh@example.com",
		issuer: "GitLab",
	});

	await assert.rejects(
		async () => {
			await service.commitBulkImport({
				expectedVaultRevision,
				preview,
				selectedDuplicateLineNumbers: [],
			});
		},
		(error: unknown) =>
			error instanceof Error &&
			"code" in error &&
			error.code === "bulk_import_preview_stale",
	);
});
