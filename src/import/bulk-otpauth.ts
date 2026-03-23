import {
	getNextTotpSortOrder,
	reindexTotpEntries,
	sortTotpEntries,
} from "../data/store";
import { parseOtpauthUri } from "../totp/otpauth";
import type {
	BulkOtpauthImportCommitResult,
	BulkOtpauthImportDuplicateBatchEntry,
	BulkOtpauthImportDuplicateExistingEntry,
	BulkOtpauthImportInvalidEntry,
	BulkOtpauthImportNewEntry,
	BulkOtpauthImportPreview,
	TotpEntryDraft,
	TotpEntryRecord,
} from "../types";

interface BulkOtpauthImportPreviewOptions {
	existingEntries: readonly TotpEntryRecord[];
	formatErrorMessage: (error: unknown) => string;
}

interface BulkOtpauthImportApplyOptions {
	existingEntries: readonly TotpEntryRecord[];
	selectedDuplicateLineNumbers: readonly number[];
	createId: () => string;
}

function normalizeIdentityPart(value: string): string {
	return value.trim().toLocaleLowerCase();
}

export function createTotpDuplicateKey(
	entry: Pick<TotpEntryDraft, "issuer" | "accountName">,
): string {
	return `${normalizeIdentityPart(entry.issuer)}\u0000${normalizeIdentityPart(entry.accountName)}`;
}

function createExistingEntryIndex(
	entries: readonly TotpEntryRecord[],
): Map<string, TotpEntryRecord> {
	const index = new Map<string, TotpEntryRecord>();

	for (const entry of entries) {
		const duplicateKey = createTotpDuplicateKey(entry);

		if (!index.has(duplicateKey)) {
			index.set(duplicateKey, entry);
		}
	}

	return index;
}

function splitCandidateLines(sourceText: string): Array<{
	lineNumber: number;
	rawLine: string;
}> {
	return sourceText.split(/\r?\n/u).flatMap((line, index) => {
		const trimmedLine = line.trim();

		if (trimmedLine.length === 0) {
			return [];
		}

		return [
			{
				lineNumber: index + 1,
				rawLine: trimmedLine,
			},
		];
	});
}

export function createBulkOtpauthImportPreview(
	sourceText: string,
	options: BulkOtpauthImportPreviewOptions,
): BulkOtpauthImportPreview {
	const newEntries: BulkOtpauthImportNewEntry[] = [];
	const duplicateExistingEntries: BulkOtpauthImportDuplicateExistingEntry[] = [];
	const duplicateBatchEntries: BulkOtpauthImportDuplicateBatchEntry[] = [];
	const invalidEntries: BulkOtpauthImportInvalidEntry[] = [];
	const seenDuplicateKeys = new Map<string, number>();
	const existingEntryIndex = createExistingEntryIndex(options.existingEntries);

	for (const candidate of splitCandidateLines(sourceText)) {
		try {
			const entry = parseOtpauthUri(candidate.rawLine);
			const duplicateKey = createTotpDuplicateKey(entry);
			const firstLineNumber = seenDuplicateKeys.get(duplicateKey);

			if (firstLineNumber !== undefined) {
				duplicateBatchEntries.push({
					kind: "duplicate-batch",
					lineNumber: candidate.lineNumber,
					rawLine: candidate.rawLine,
					duplicateKey,
					entry,
					firstLineNumber,
				});
				continue;
			}

			seenDuplicateKeys.set(duplicateKey, candidate.lineNumber);

			const existingEntry = existingEntryIndex.get(duplicateKey);

			if (existingEntry) {
				duplicateExistingEntries.push({
					kind: "duplicate-existing",
					lineNumber: candidate.lineNumber,
					rawLine: candidate.rawLine,
					duplicateKey,
					entry,
					existingEntry,
				});
				continue;
			}

			newEntries.push({
				kind: "new",
				lineNumber: candidate.lineNumber,
				rawLine: candidate.rawLine,
				duplicateKey,
				entry,
			});
		} catch (error) {
			invalidEntries.push({
				kind: "invalid",
				lineNumber: candidate.lineNumber,
				rawLine: candidate.rawLine,
				errorMessage: options.formatErrorMessage(error),
			});
		}
	}

	return {
		sourceText,
		newEntries,
		duplicateExistingEntries,
		duplicateBatchEntries,
		invalidEntries,
		stats: {
			newCount: newEntries.length,
			duplicateExistingCount: duplicateExistingEntries.length,
			duplicateBatchCount: duplicateBatchEntries.length,
			invalidCount: invalidEntries.length,
			actionableCount: newEntries.length + duplicateExistingEntries.length,
		},
	};
}

export function applyBulkOtpauthImportPreview(
	preview: BulkOtpauthImportPreview,
	options: BulkOtpauthImportApplyOptions,
): BulkOtpauthImportCommitResult {
	const selectedDuplicateLineNumbers = new Set(options.selectedDuplicateLineNumbers);
	const orderedExistingEntries = sortTotpEntries(options.existingEntries);
	const nextEntriesById = new Map(
		orderedExistingEntries.map((entry) => [entry.id, entry] as const),
	);
	const addedEntries: TotpEntryRecord[] = [];
	const replacedEntries: TotpEntryRecord[] = [];
	let nextSortOrder = getNextTotpSortOrder(orderedExistingEntries);

	for (const newEntry of preview.newEntries) {
		const record: TotpEntryRecord = {
			id: options.createId(),
			sortOrder: nextSortOrder,
			...newEntry.entry,
		};
		nextSortOrder += 1;
		addedEntries.push(record);
		nextEntriesById.set(record.id, record);
	}

	for (const duplicateEntry of preview.duplicateExistingEntries) {
		if (!selectedDuplicateLineNumbers.has(duplicateEntry.lineNumber)) {
			continue;
		}

		const record: TotpEntryRecord = {
			id: duplicateEntry.existingEntry.id,
			sortOrder: duplicateEntry.existingEntry.sortOrder,
			...duplicateEntry.entry,
		};
		replacedEntries.push(record);
		nextEntriesById.set(record.id, record);
	}

	const nextEntries = reindexTotpEntries([...nextEntriesById.values()]);

	return {
		nextEntries,
		addedEntries,
		replacedEntries,
		skippedDuplicateExistingEntries: preview.duplicateExistingEntries.filter(
			(entry) => !selectedDuplicateLineNumbers.has(entry.lineNumber),
		),
		skippedDuplicateBatchEntries: [...preview.duplicateBatchEntries],
		invalidEntries: [...preview.invalidEntries],
	};
}
