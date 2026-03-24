import assert from "node:assert/strict";
import test from "node:test";
import { createBulkOtpauthImportPreview } from "../src/import/bulk-otpauth";
import type { PluginData, TotpEntryDraft } from "../src/types";
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
		onSaveData?: (data: PluginData) => Promise<void>;
	} = {},
) {
	const savedSnapshots: PluginData[] = [];
	let idCounter = 0;

	const service = new TwoFactorVaultService({
		createId: () => `entry-${++idCounter}`,
		loadData: async () => initialData,
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
	assert.equal(service.shouldShowFloatingLockButton(), true);
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
