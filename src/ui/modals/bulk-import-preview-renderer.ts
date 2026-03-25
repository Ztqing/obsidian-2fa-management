import type { TranslationKey } from "../../i18n/translations";
import type {
	BulkOtpauthImportDuplicateBatchEntry,
	BulkOtpauthImportDuplicateExistingEntry,
	BulkOtpauthImportInvalidEntry,
	BulkOtpauthImportNewEntry,
	TranslationVariables,
	TotpEntryDraft,
} from "../../types";
import {
	formatBulkImportEntryLabel,
	type BulkOtpauthImportSection,
} from "./bulk-otpauth-import-state";

export interface BulkImportPreviewRendererEnvironment {
	t: (key: TranslationKey, variables?: TranslationVariables) => string;
}

export interface BulkImportPreviewRendererState {
	getSections(): BulkOtpauthImportSection[];
	isDuplicateSelectionEnabled(lineNumber: number): boolean;
}

export class BulkImportPreviewRenderer {
	constructor(
		private readonly environment: BulkImportPreviewRendererEnvironment,
		private readonly state: BulkImportPreviewRendererState,
		private readonly onDuplicateSelectionChange: (
			lineNumber: number,
			isSelected: boolean,
		) => void,
	) {}

	render(containerEl: HTMLElement): void {
		for (const section of this.state.getSections()) {
			if (section.kind === "new") {
				this.renderNewEntriesSection(containerEl, section.entries);
				continue;
			}

			if (section.kind === "duplicate-existing") {
				this.renderDuplicateExistingSection(containerEl, section.entries);
				continue;
			}

			if (section.kind === "duplicate-batch") {
				this.renderDuplicateBatchSection(containerEl, section.entries);
				continue;
			}

			this.renderInvalidSection(containerEl, section.entries);
		}
	}

	renderSummary(
		containerEl: HTMLElement,
		stats: {
			duplicateBatchCount: number;
			duplicateExistingCount: number;
			invalidCount: number;
			newCount: number;
		},
	): void {
		const summary = containerEl.createDiv({
			cls: "twofa-bulk-import-summary",
		});
		summary.createEl("h4", {
			text: this.environment.t("modal.bulkImport.summary.title"),
		});
		const cards = summary.createDiv({
			cls: "twofa-bulk-import-summary__cards",
		});
		this.renderSummaryCard(cards, this.environment.t("modal.bulkImport.summary.new"), stats.newCount);
		this.renderSummaryCard(
			cards,
			this.environment.t("modal.bulkImport.summary.duplicateExisting"),
			stats.duplicateExistingCount,
		);
		this.renderSummaryCard(
			cards,
			this.environment.t("modal.bulkImport.summary.duplicateBatch"),
			stats.duplicateBatchCount,
		);
		this.renderSummaryCard(
			cards,
			this.environment.t("modal.bulkImport.summary.invalid"),
			stats.invalidCount,
		);
	}

	private renderSummaryCard(containerEl: HTMLElement, label: string, count: number): void {
		const card = containerEl.createDiv({
			cls: "twofa-bulk-import-summary__card",
		});
		card.createDiv({
			cls: "twofa-bulk-import-summary__count",
			text: String(count),
		});
		card.createDiv({
			cls: "twofa-bulk-import-summary__label",
			text: label,
		});
	}

	private renderNewEntriesSection(
		containerEl: HTMLElement,
		entries: readonly BulkOtpauthImportNewEntry[],
	): void {
		if (entries.length === 0) {
			return;
		}

		const section = this.createSection(
			containerEl,
			this.environment.t("modal.bulkImport.section.new"),
			entries.length,
		);
		const list = section.createDiv({
			cls: "twofa-bulk-import-list",
		});

		for (const entry of entries) {
			const item = list.createDiv({
				cls: "twofa-bulk-import-item",
			});
			this.renderItemHeader(item, entry.entry, entry.lineNumber);
			this.renderRawLine(item, entry.rawLine);
		}
	}

	private renderDuplicateExistingSection(
		containerEl: HTMLElement,
		entries: readonly BulkOtpauthImportDuplicateExistingEntry[],
	): void {
		if (entries.length === 0) {
			return;
		}

		const section = this.createSection(
			containerEl,
			this.environment.t("modal.bulkImport.section.duplicateExisting"),
			entries.length,
		);
		section.createEl("p", {
			cls: "twofa-bulk-import-section__description",
			text: this.environment.t("modal.bulkImport.section.duplicateExistingDescription"),
		});

		const list = section.createDiv({
			cls: "twofa-bulk-import-list",
		});

		for (const entry of entries) {
			const item = list.createDiv({
				cls: "twofa-bulk-import-item twofa-bulk-import-item--selectable",
			});
			const label = item.createEl("label", {
				cls: "twofa-bulk-import-checkbox",
			});
			const checkbox = label.createEl("input", {
				type: "checkbox",
			});
			checkbox.checked = this.state.isDuplicateSelectionEnabled(entry.lineNumber);
			checkbox.addEventListener("change", () => {
				this.onDuplicateSelectionChange(entry.lineNumber, checkbox.checked);
			});

			const body = label.createDiv({
				cls: "twofa-bulk-import-checkbox__body",
			});
			this.renderItemHeader(body, entry.entry, entry.lineNumber);
			body.createEl("div", {
				cls: "twofa-bulk-import-item__meta",
				text: this.environment.t("modal.bulkImport.row.existing", {
					label: formatBulkImportEntryLabel(entry.existingEntry),
				}),
			});
			body.createEl("div", {
				cls: "twofa-bulk-import-item__meta",
				text: this.environment.t("modal.bulkImport.action.replace"),
			});
			this.renderRawLine(body, entry.rawLine);
		}
	}

	private renderDuplicateBatchSection(
		containerEl: HTMLElement,
		entries: readonly BulkOtpauthImportDuplicateBatchEntry[],
	): void {
		if (entries.length === 0) {
			return;
		}

		const section = this.createSection(
			containerEl,
			this.environment.t("modal.bulkImport.section.duplicateBatch"),
			entries.length,
		);
		const list = section.createDiv({
			cls: "twofa-bulk-import-list",
		});

		for (const entry of entries) {
			const item = list.createDiv({
				cls: "twofa-bulk-import-item",
			});
			this.renderItemHeader(item, entry.entry, entry.lineNumber);
			item.createEl("div", {
				cls: "twofa-bulk-import-item__meta",
				text: this.environment.t("modal.bulkImport.row.firstSeen", {
					lineNumber: entry.firstLineNumber,
				}),
			});
			this.renderRawLine(item, entry.rawLine);
		}
	}

	private renderInvalidSection(
		containerEl: HTMLElement,
		entries: readonly BulkOtpauthImportInvalidEntry[],
	): void {
		if (entries.length === 0) {
			return;
		}

		const section = this.createSection(
			containerEl,
			this.environment.t("modal.bulkImport.section.invalid"),
			entries.length,
		);
		const list = section.createDiv({
			cls: "twofa-bulk-import-list",
		});

		for (const entry of entries) {
			const item = list.createDiv({
				cls: "twofa-bulk-import-item twofa-bulk-import-item--error",
			});
			const heading = item.createDiv({
				cls: "twofa-bulk-import-item__header",
			});
			heading.createEl("strong", {
				text: this.environment.t("modal.bulkImport.row.line", {
					lineNumber: entry.lineNumber,
				}),
			});
			item.createEl("div", {
				cls: "twofa-bulk-import-item__meta",
				text: entry.errorMessage,
			});
			this.renderRawLine(item, entry.rawLine);
		}
	}

	private createSection(containerEl: HTMLElement, title: string, count: number): HTMLElement {
		const section = containerEl.createDiv({
			cls: "twofa-bulk-import-section",
		});
		section.createEl("h4", {
			text: `${title} (${count})`,
		});
		return section;
	}

	private renderItemHeader(
		containerEl: HTMLElement,
		entry: Pick<TotpEntryDraft, "issuer" | "accountName">,
		lineNumber: number,
	): void {
		const header = containerEl.createDiv({
			cls: "twofa-bulk-import-item__header",
		});
		header.createEl("strong", {
			text: formatBulkImportEntryLabel(entry),
		});
		header.createEl("span", {
			cls: "twofa-bulk-import-item__line",
			text: this.environment.t("modal.bulkImport.row.line", {
				lineNumber,
			}),
		});
	}

	private renderRawLine(containerEl: HTMLElement, rawLine: string): void {
		containerEl.createEl("code", {
			cls: "twofa-bulk-import-item__raw-line",
			text: rawLine,
		});
	}
}
