import assert from "node:assert/strict";
import test from "node:test";
import {
	BulkOtpauthImportModalState,
	formatBulkImportEntryLabel,
} from "../src/ui/modals/bulk-otpauth-import-state";
import type { BulkOtpauthImportPreview } from "../src/types";

const preview: BulkOtpauthImportPreview = {
	duplicateBatchEntries: [
		{
			duplicateKey: "duplicate-batch",
			entry: {
				accountName: "batch@example.com",
				algorithm: "SHA-1",
				digits: 6,
				issuer: "Batch",
				period: 30,
				secret: "JBSWY3DPEHPK3PXP",
			},
			firstLineNumber: 1,
			kind: "duplicate-batch",
			lineNumber: 2,
			rawLine: "otpauth://duplicate-batch",
		},
	],
	duplicateExistingEntries: [
		{
			duplicateKey: "duplicate-existing",
			entry: {
				accountName: "existing@example.com",
				algorithm: "SHA-1",
				digits: 6,
				issuer: "Existing",
				period: 30,
				secret: "JBSWY3DPEHPK3PXP",
			},
			existingEntry: {
				accountName: "existing@example.com",
				algorithm: "SHA-1",
				digits: 6,
				id: "existing",
				issuer: "Existing",
				period: 30,
				secret: "JBSWY3DPEHPK3PXP",
				sortOrder: 0,
			},
			kind: "duplicate-existing",
			lineNumber: 3,
			rawLine: "otpauth://duplicate-existing",
		},
	],
	invalidEntries: [
		{
			errorMessage: "invalid",
			kind: "invalid",
			lineNumber: 4,
			rawLine: "not-an-otpauth-link",
		},
	],
	newEntries: [
		{
			duplicateKey: "new",
			entry: {
				accountName: "new@example.com",
				algorithm: "SHA-1",
				digits: 6,
				issuer: "New",
				period: 30,
				secret: "JBSWY3DPEHPK3PXP",
			},
			kind: "new",
			lineNumber: 1,
			rawLine: "otpauth://new",
		},
	],
	sourceText: "otpauth://new",
	stats: {
		actionableCount: 2,
		duplicateBatchCount: 1,
		duplicateExistingCount: 1,
		invalidCount: 1,
		newCount: 1,
	},
};

test("BulkOtpauthImportModalState tracks preview dirty state and selected replacements", () => {
	const state = new BulkOtpauthImportModalState();

	assert.equal(
		state.handleSourceTextChanged(),
		"modal.bulkImport.status.previewRequired",
	);
	assert.equal(state.applyPreview(preview), "modal.bulkImport.status.previewReady");
	assert.equal(state.getImportableEntryCount(), 1);

	state.toggleDuplicateSelection(3, true);
	assert.equal(state.isDuplicateSelectionEnabled(3), true);
	assert.equal(state.getImportableEntryCount(), 2);

	assert.equal(
		state.handleSourceTextChanged(),
		"modal.bulkImport.status.previewOutdated",
	);
	assert.equal(state.getImportableEntryCount(), 0);
});

test("BulkOtpauthImportModalState validates submit preconditions and sorts selected lines", () => {
	const state = new BulkOtpauthImportModalState();

	assert.deepEqual(state.createSubmitState(), {
		kind: "error",
		statusKey: "modal.bulkImport.status.previewRequired",
	});

	state.applyPreview(preview);
	state.toggleDuplicateSelection(7, true);
	state.toggleDuplicateSelection(3, true);

	const submitState = state.createSubmitState();
	assert.equal(submitState.kind, "ready");
	if (submitState.kind !== "ready") {
		return;
	}

	assert.deepEqual(submitState.result.selectedDuplicateLineNumbers, [3, 7]);
});

test("BulkOtpauthImportModalState exposes ordered preview sections", () => {
	const state = new BulkOtpauthImportModalState();

	state.applyPreview(preview);

	assert.deepEqual(
		state.getSections().map((section) => section.kind),
		["new", "duplicate-existing", "duplicate-batch", "invalid"],
	);
});

test("formatBulkImportEntryLabel prefers issuer when available", () => {
	assert.equal(
		formatBulkImportEntryLabel({
			accountName: "user@example.com",
			issuer: "GitHub",
		}),
		"GitHub / user@example.com",
	);

	assert.equal(
		formatBulkImportEntryLabel({
			accountName: "user@example.com",
			issuer: "",
		}),
		"user@example.com",
	);
});
