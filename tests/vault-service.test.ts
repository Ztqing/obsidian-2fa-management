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

function createService(initialData: unknown = null) {
	const savedSnapshots: PluginData[] = [];
	let idCounter = 0;

	const service = new TwoFactorVaultService({
		createId: () => `entry-${++idCounter}`,
		loadData: async () => initialData,
		saveData: async (data) => {
			savedSnapshots.push(structuredClone(data));
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

	await service.updateEntry("entry-1", {
		...baseDraft,
		accountName: "updated@example.com",
	});
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

	const commitResult = await service.commitBulkImport(preview, [1]);
	const entries = service.getEntries();

	assert.equal(commitResult.replacedEntries.length, 1);
	assert.equal(commitResult.addedEntries.length, 1);
	assert.equal(entries.length, 2);
	assert.equal(entries[0]?.id, "entry-1");
	assert.equal(entries[0]?.secret, "ABCDEFGHIJKLMNOP");
	assert.equal(entries[1]?.issuer, "Linear");
});
