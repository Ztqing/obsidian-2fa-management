import assert from "node:assert/strict";
import test from "node:test";
import { createBulkOtpauthImportPreview } from "../src/import/bulk-otpauth";
import { VaultEntryMutations } from "../src/vault/entry-mutations";
import type { TotpEntryDraft, TotpEntryRecord } from "../src/types";

const baseDraft: TotpEntryDraft = {
	accountName: "name@example.com",
	algorithm: "SHA-1",
	digits: 6,
	issuer: "GitHub",
	period: 30,
	secret: "JBSWY3DPEHPK3PXP",
};

function createEntry(id: string, overrides: Partial<TotpEntryRecord> = {}): TotpEntryRecord {
	return {
		id,
		sortOrder: Number(id.replace(/\D+/g, "")) || 0,
		...baseDraft,
		...overrides,
	};
}

function createManager(entries: TotpEntryRecord[] = []) {
	const committed: TotpEntryRecord[][] = [];
	const revisionChecks: Array<{
		errorCode: "bulk_import_preview_stale" | "entry_changed_during_edit";
		expectedVaultRevision: number;
	}> = [];

	return {
		committed,
		manager: new VaultEntryMutations({
			assertVaultRevision: (expectedVaultRevision, errorCode) => {
				revisionChecks.push({
					errorCode,
					expectedVaultRevision,
				});
			},
			createId: () => `generated-${committed.length + 1}`,
			encryptedVaultManager: {
				async commitUnlockedEntries(nextEntries): Promise<void> {
					committed.push([...nextEntries]);
				},
			},
			session: {
				requireUnlockedEntries: () => [...entries],
			},
		}),
		revisionChecks,
	};
}

test("VaultEntryMutations adds normalized entries with the next generated id and sort order", async () => {
	const { committed, manager } = createManager([createEntry("entry-1")]);

	await manager.addEntry({
		...baseDraft,
		issuer: "",
	});

	assert.deepEqual(
		committed[0]?.map((entry) => [entry.id, entry.sortOrder, entry.issuer]),
		[
			["entry-1", 1, "GitHub"],
			["generated-1", 2, ""],
		],
	);
});

test("VaultEntryMutations updates entries only after the revision check succeeds", async () => {
	const { committed, manager, revisionChecks } = createManager([createEntry("entry-1")]);

	await manager.updateEntry(
		"entry-1",
		{
			...baseDraft,
			accountName: "updated@example.com",
		},
		9,
	);

	assert.deepEqual(revisionChecks, [
		{
			errorCode: "entry_changed_during_edit",
			expectedVaultRevision: 9,
		},
	]);
	assert.equal(committed[0]?.[0]?.accountName, "updated@example.com");
});

test("VaultEntryMutations commits actionable bulk imports and preserves no-op previews", async () => {
	const existingEntries = [createEntry("entry-1")];
	const preview = createBulkOtpauthImportPreview(
		[
			"otpauth://totp/GitHub:name@example.com?secret=ABCDEFGHIJKLMNOP",
			"otpauth://totp/Linear:person@example.com?secret=QRSTUVWXYZ234567",
		].join("\n"),
		{
			existingEntries,
			formatErrorMessage: (error) =>
				error instanceof Error ? error.message : String(error),
		},
	);

	const { committed, manager, revisionChecks } = createManager(existingEntries);
	const commitResult = await manager.commitBulkImport({
		expectedVaultRevision: 4,
		preview,
		selectedDuplicateLineNumbers: [1],
	});

	assert.deepEqual(revisionChecks, [
		{
			errorCode: "bulk_import_preview_stale",
			expectedVaultRevision: 4,
		},
	]);
	assert.equal(commitResult.addedEntries.length, 1);
	assert.equal(commitResult.replacedEntries.length, 1);
	assert.equal(committed[0]?.length, 2);
});
