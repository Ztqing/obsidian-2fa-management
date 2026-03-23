import type {
	BulkOtpauthImportDuplicateBatchEntry,
	BulkOtpauthImportDuplicateExistingEntry,
	BulkOtpauthImportInvalidEntry,
	BulkOtpauthImportNewEntry,
	BulkOtpauthImportPreview,
	TotpEntryDraft,
} from "../../types";
import type { BulkOtpauthImportModalResult } from "./bulk-otpauth-import-modal";

export type BulkOtpauthImportStatusKey =
	| "modal.bulkImport.status.noActionable"
	| "modal.bulkImport.status.previewOutdated"
	| "modal.bulkImport.status.previewReady"
	| "modal.bulkImport.status.previewRequired";

export type BulkOtpauthImportSection =
	| {
			entries: readonly BulkOtpauthImportNewEntry[];
			kind: "new";
			titleKey: "modal.bulkImport.section.new";
	  }
	| {
			entries: readonly BulkOtpauthImportDuplicateExistingEntry[];
			kind: "duplicate-existing";
			titleKey: "modal.bulkImport.section.duplicateExisting";
	  }
	| {
			entries: readonly BulkOtpauthImportDuplicateBatchEntry[];
			kind: "duplicate-batch";
			titleKey: "modal.bulkImport.section.duplicateBatch";
	  }
	| {
			entries: readonly BulkOtpauthImportInvalidEntry[];
			kind: "invalid";
			titleKey: "modal.bulkImport.section.invalid";
	  };

export type BulkOtpauthImportSubmitState =
	| {
			kind: "error";
			statusKey: BulkOtpauthImportStatusKey;
	  }
	| {
			kind: "ready";
			result: BulkOtpauthImportModalResult;
	  };

export class BulkOtpauthImportModalState {
	constructor(private readonly expectedVaultRevision: number) {}

	private preview: BulkOtpauthImportPreview | null = null;
	private previewDirty = false;
	private readonly selectedDuplicateLineNumbers = new Set<number>();

	handleSourceTextChanged(): BulkOtpauthImportStatusKey {
		this.previewDirty = this.preview !== null;
		return this.previewDirty
			? "modal.bulkImport.status.previewOutdated"
			: "modal.bulkImport.status.previewRequired";
	}

	applyPreview(preview: BulkOtpauthImportPreview): BulkOtpauthImportStatusKey {
		this.preview = preview;
		this.previewDirty = false;
		this.selectedDuplicateLineNumbers.clear();
		return preview.stats.actionableCount === 0
			? "modal.bulkImport.status.noActionable"
			: "modal.bulkImport.status.previewReady";
	}

	getPreview(): BulkOtpauthImportPreview | null {
		return this.preview;
	}

	getSections(): BulkOtpauthImportSection[] {
		if (!this.preview) {
			return [];
		}

		const sections: BulkOtpauthImportSection[] = [];

		if (this.preview.newEntries.length > 0) {
			sections.push({
				entries: this.preview.newEntries,
				kind: "new",
				titleKey: "modal.bulkImport.section.new",
			});
		}

		if (this.preview.duplicateExistingEntries.length > 0) {
			sections.push({
				entries: this.preview.duplicateExistingEntries,
				kind: "duplicate-existing",
				titleKey: "modal.bulkImport.section.duplicateExisting",
			});
		}

		if (this.preview.duplicateBatchEntries.length > 0) {
			sections.push({
				entries: this.preview.duplicateBatchEntries,
				kind: "duplicate-batch",
				titleKey: "modal.bulkImport.section.duplicateBatch",
			});
		}

		if (this.preview.invalidEntries.length > 0) {
			sections.push({
				entries: this.preview.invalidEntries,
				kind: "invalid",
				titleKey: "modal.bulkImport.section.invalid",
			});
		}

		return sections;
	}

	isDuplicateSelectionEnabled(lineNumber: number): boolean {
		return this.selectedDuplicateLineNumbers.has(lineNumber);
	}

	toggleDuplicateSelection(lineNumber: number, isSelected: boolean): void {
		if (isSelected) {
			this.selectedDuplicateLineNumbers.add(lineNumber);
			return;
		}

		this.selectedDuplicateLineNumbers.delete(lineNumber);
	}

	getImportableEntryCount(): number {
		if (!this.preview || this.previewDirty) {
			return 0;
		}

		return this.preview.newEntries.length + this.selectedDuplicateLineNumbers.size;
	}

	isImportDisabled(): boolean {
		return this.getImportableEntryCount() === 0;
	}

	createSubmitState(): BulkOtpauthImportSubmitState {
		if (!this.preview) {
			return {
				kind: "error",
				statusKey: "modal.bulkImport.status.previewRequired",
			};
		}

		if (this.previewDirty) {
			return {
				kind: "error",
				statusKey: "modal.bulkImport.status.previewOutdated",
			};
		}

		if (this.getImportableEntryCount() === 0) {
			return {
				kind: "error",
				statusKey: "modal.bulkImport.status.noActionable",
			};
		}

		return {
			kind: "ready",
			result: {
				expectedVaultRevision: this.expectedVaultRevision,
				preview: this.preview,
				selectedDuplicateLineNumbers: [...this.selectedDuplicateLineNumbers].sort(
					(left, right) => left - right,
				),
			},
		};
	}
}

export function formatBulkImportEntryLabel(
	entry: Pick<TotpEntryDraft, "issuer" | "accountName">,
): string {
	return entry.issuer.length > 0
		? `${entry.issuer} / ${entry.accountName}`
		: entry.accountName;
}
