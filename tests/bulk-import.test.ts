import assert from "node:assert/strict";
import test from "node:test";
import {
	applyBulkOtpauthImportPreview,
	createBulkOtpauthImportPreview,
} from "../src/import/bulk-otpauth";
import { TwoFaUserError } from "../src/errors";
import type { TotpEntryRecord } from "../src/types";

const existingEntries: TotpEntryRecord[] = [
	{
		id: "existing-github",
		sortOrder: 0,
		issuer: "GitHub",
		accountName: "name@example.com",
		secret: "JBSWY3DPEHPK3PXP",
		algorithm: "SHA-1",
		digits: 6,
		period: 30,
	},
];

function formatErrorMessage(error: unknown): string {
	if (error instanceof TwoFaUserError) {
		return error.code;
	}

	return error instanceof Error ? error.message : String(error);
}

function createPreview(sourceText: string, entries: readonly TotpEntryRecord[] = []): ReturnType<
	typeof createBulkOtpauthImportPreview
> {
	return createBulkOtpauthImportPreview(sourceText, {
		existingEntries: entries,
		formatErrorMessage,
	});
}

test("createBulkOtpauthImportPreview parses multiple valid lines and ignores blanks", () => {
	const preview = createPreview(
		[
			"otpauth://totp/GitLab:dev@example.com?secret=KRUGS4ZANFZSAYJA&issuer=GitLab",
			"",
			"   ",
			"otpauth://totp/Google:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Google",
		].join("\n"),
	);

	assert.equal(preview.newEntries.length, 2);
	assert.equal(preview.newEntries[0]?.lineNumber, 1);
	assert.equal(preview.newEntries[1]?.lineNumber, 4);
	assert.equal(preview.stats.newCount, 2);
	assert.equal(preview.stats.invalidCount, 0);
});

test("createBulkOtpauthImportPreview separates new, existing duplicate, batch duplicate, and invalid lines", () => {
	const preview = createPreview(
		[
			"otpauth://totp/GitLab:dev@example.com?secret=KRUGS4ZANFZSAYJA&issuer=GitLab",
			"otpauth://totp/github:name@example.com?secret=GEZDGNBVGY3TQOJQ&issuer=github",
			"otpauth://totp/GitLab:dev@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitLab",
			"https://example.com/not-supported",
		].join("\n"),
		existingEntries,
	);

	assert.equal(preview.newEntries.length, 1);
	assert.equal(preview.duplicateExistingEntries.length, 1);
	assert.equal(preview.duplicateBatchEntries.length, 1);
	assert.equal(preview.invalidEntries.length, 1);
	assert.equal(preview.duplicateBatchEntries[0]?.firstLineNumber, 1);
	assert.equal(preview.invalidEntries[0]?.errorMessage, "otpauth_totp_only");
});

test("createBulkOtpauthImportPreview treats later duplicate-existing lines in the same batch as batch duplicates", () => {
	const preview = createPreview(
		[
			"otpauth://totp/GitHub:name@example.com?secret=GEZDGNBVGY3TQOJQ&issuer=GitHub",
			"otpauth://totp/GitHub:name@example.com?secret=KRUGS4ZANFZSAYJA&issuer=GitHub",
		].join("\n"),
		existingEntries,
	);

	assert.equal(preview.duplicateExistingEntries.length, 1);
	assert.equal(preview.duplicateExistingEntries[0]?.lineNumber, 1);
	assert.equal(preview.duplicateBatchEntries.length, 1);
	assert.equal(preview.duplicateBatchEntries[0]?.lineNumber, 2);
	assert.equal(preview.duplicateBatchEntries[0]?.firstLineNumber, 1);
});

test("applyBulkOtpauthImportPreview skips existing duplicates by default", () => {
	const preview = createPreview(
		[
			"otpauth://totp/GitHub:name@example.com?secret=GEZDGNBVGY3TQOJQ&issuer=GitHub",
			"otpauth://totp/GitLab:dev@example.com?secret=KRUGS4ZANFZSAYJA&issuer=GitLab",
		].join("\n"),
		existingEntries,
	);
	let idCounter = 0;
	const result = applyBulkOtpauthImportPreview(preview, {
		existingEntries,
		selectedDuplicateLineNumbers: [],
		createId: () => `generated-${++idCounter}`,
	});

	assert.equal(result.addedEntries.length, 1);
	assert.equal(result.replacedEntries.length, 0);
	assert.equal(result.skippedDuplicateExistingEntries.length, 1);
	assert.equal(result.nextEntries.length, 2);
	assert.equal(result.nextEntries[0]?.id, "existing-github");
	assert.equal(result.nextEntries[1]?.id, "generated-1");
	assert.equal(result.nextEntries[0]?.sortOrder, 0);
	assert.equal(result.nextEntries[1]?.sortOrder, 1);
});

test("applyBulkOtpauthImportPreview replaces selected duplicates and preserves the original id", () => {
	const preview = createPreview(
		"otpauth://totp/GitHub:name@example.com?secret=GEZDGNBVGY3TQOJQ&issuer=GitHub",
		existingEntries,
	);
	const result = applyBulkOtpauthImportPreview(preview, {
		existingEntries,
		selectedDuplicateLineNumbers: [1],
		createId: () => "generated-unused",
	});

	assert.equal(result.addedEntries.length, 0);
	assert.equal(result.replacedEntries.length, 1);
	assert.equal(result.replacedEntries[0]?.id, "existing-github");
	assert.equal(result.replacedEntries[0]?.sortOrder, 0);
	assert.equal(result.replacedEntries[0]?.secret, "GEZDGNBVGY3TQOJQ");
	assert.equal(result.nextEntries.length, 1);
	assert.equal(result.nextEntries[0]?.id, "existing-github");
	assert.equal(result.nextEntries[0]?.sortOrder, 0);
	assert.equal(result.nextEntries[0]?.secret, "GEZDGNBVGY3TQOJQ");
});

test("applyBulkOtpauthImportPreview appends new entries after the existing manual order", () => {
	const preview = createPreview(
		[
			"otpauth://totp/GitLab:dev@example.com?secret=KRUGS4ZANFZSAYJA&issuer=GitLab",
			"otpauth://totp/Google:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Google",
		].join("\n"),
		existingEntries,
	);
	let idCounter = 0;
	const result = applyBulkOtpauthImportPreview(preview, {
		existingEntries,
		selectedDuplicateLineNumbers: [],
		createId: () => `generated-${++idCounter}`,
	});

	assert.deepEqual(
		result.nextEntries.map((entry) => [entry.id, entry.sortOrder]),
		[
			["existing-github", 0],
			["generated-1", 1],
			["generated-2", 2],
		],
	);
});
