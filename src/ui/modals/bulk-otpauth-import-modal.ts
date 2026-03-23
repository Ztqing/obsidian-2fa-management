import { ButtonComponent, Modal, Setting, TextAreaComponent } from "obsidian";
import { createBulkOtpauthImportPreview } from "../../import/bulk-otpauth";
import type {
	BulkOtpauthImportDuplicateBatchEntry,
	BulkOtpauthImportDuplicateExistingEntry,
	BulkOtpauthImportInvalidEntry,
	BulkOtpauthImportNewEntry,
	BulkOtpauthImportPreview,
	TotpEntryDraft,
	TotpEntryRecord,
} from "../../types";
import type TwoFactorManagementPlugin from "../../plugin";
import {
	BulkOtpauthImportModalState,
	formatBulkImportEntryLabel,
} from "./bulk-otpauth-import-state";

export interface BulkOtpauthImportModalResult {
	preview: BulkOtpauthImportPreview;
	selectedDuplicateLineNumbers: number[];
}

class BulkOtpauthImportModal extends Modal {
	private readonly plugin: TwoFactorManagementPlugin;
	private readonly existingEntries: readonly TotpEntryRecord[];
	private readonly resolve: (result: BulkOtpauthImportModalResult | null) => void;
	private sourceInput: TextAreaComponent | null = null;
	private statusEl: HTMLElement | null = null;
	private resultsEl: HTMLElement | null = null;
	private importButton: ButtonComponent | null = null;
	private settled = false;
	private readonly state = new BulkOtpauthImportModalState();

	constructor(
		plugin: TwoFactorManagementPlugin,
		existingEntries: readonly TotpEntryRecord[],
		resolve: (result: BulkOtpauthImportModalResult | null) => void,
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.existingEntries = existingEntries;
		this.resolve = resolve;
	}

	onOpen(): void {
		this.titleEl.setText(this.plugin.t("modal.bulkImport.title"));
		this.contentEl.createEl("p", {
			text: this.plugin.t("modal.bulkImport.intro"),
		});
		this.statusEl = this.contentEl.createDiv({
			cls: "twofa-modal-status",
		});

		new Setting(this.contentEl)
			.setName(this.plugin.t("modal.bulkImport.input.name"))
			.setDesc(this.plugin.t("modal.bulkImport.input.description"))
			.addTextArea((text) => {
				this.sourceInput = text;
				text.inputEl.rows = 10;
				text.inputEl.placeholder = this.plugin.t("modal.bulkImport.input.placeholder");
				text.onChange(() => {
					this.setStatus(
						this.plugin.t(this.state.handleSourceTextChanged()),
						false,
					);
					this.updateImportButtonState();
				});
			});

		this.resultsEl = this.contentEl.createDiv({
			cls: "twofa-bulk-import-results",
		});

		const actions = new Setting(this.contentEl);
		actions.settingEl.addClass("twofa-modal-actions");
		actions.addButton((button) => {
			button.setButtonText(this.plugin.t("common.cancel")).onClick(() => {
				this.finish(null);
			});
		});
		actions.addButton((button) => {
			button.setButtonText(this.plugin.t("common.previewImport")).onClick(() => {
				void this.handlePreview();
			});
		});
		actions.addButton((button) => {
			this.importButton = button;
			button
				.setButtonText(this.plugin.t("common.importSelected"))
				.setCta()
				.onClick(() => {
					this.handleSubmit();
				});
		});

		this.setStatus(this.plugin.t("modal.bulkImport.status.previewRequired"), false);
		this.updateImportButtonState();

		window.setTimeout(() => {
			this.sourceInput?.inputEl.focus();
		}, 0);
	}

	onClose(): void {
		this.contentEl.empty();

		if (!this.settled) {
			this.resolve(null);
		}
	}

	private async handlePreview(): Promise<void> {
		const preview = createBulkOtpauthImportPreview(this.sourceInput?.getValue() ?? "", {
			existingEntries: this.existingEntries,
			formatErrorMessage: (error) => this.plugin.getErrorMessage(error),
		});
		const statusKey = this.state.applyPreview(preview);
		this.renderPreview();
		this.setStatus(this.plugin.t(statusKey), false);
		this.updateImportButtonState();
	}

	private handleSubmit(): void {
		const submitState = this.state.createSubmitState();
		if (submitState.kind === "error") {
			this.setStatus(this.plugin.t(submitState.statusKey), true);
			return;
		}

		this.finish(submitState.result);
	}

	private renderPreview(): void {
		if (!this.resultsEl) {
			return;
		}

		this.resultsEl.empty();

		const preview = this.state.getPreview();
		if (!preview) {
			return;
		}

		const summary = this.resultsEl.createDiv({
			cls: "twofa-bulk-import-summary",
		});
		summary.createEl("h4", {
			text: this.plugin.t("modal.bulkImport.summary.title"),
		});
		const cards = summary.createDiv({
			cls: "twofa-bulk-import-summary__cards",
		});
		this.renderSummaryCard(
			cards,
			this.plugin.t("modal.bulkImport.summary.new"),
			preview.stats.newCount,
		);
		this.renderSummaryCard(
			cards,
			this.plugin.t("modal.bulkImport.summary.duplicateExisting"),
			preview.stats.duplicateExistingCount,
		);
		this.renderSummaryCard(
			cards,
			this.plugin.t("modal.bulkImport.summary.duplicateBatch"),
			preview.stats.duplicateBatchCount,
		);
		this.renderSummaryCard(
			cards,
			this.plugin.t("modal.bulkImport.summary.invalid"),
			preview.stats.invalidCount,
		);

		for (const section of this.state.getSections()) {
			if (section.kind === "new") {
				this.renderNewEntriesSection(section.entries);
				continue;
			}

			if (section.kind === "duplicate-existing") {
				this.renderDuplicateExistingSection(section.entries);
				continue;
			}

			if (section.kind === "duplicate-batch") {
				this.renderDuplicateBatchSection(section.entries);
				continue;
			}

			this.renderInvalidSection(section.entries);
		}
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

	private renderNewEntriesSection(entries: readonly BulkOtpauthImportNewEntry[]): void {
		if (!this.resultsEl || entries.length === 0) {
			return;
		}

		const section = this.createSection(this.plugin.t("modal.bulkImport.section.new"), entries.length);
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
		entries: readonly BulkOtpauthImportDuplicateExistingEntry[],
	): void {
		if (!this.resultsEl || entries.length === 0) {
			return;
		}

		const section = this.createSection(
			this.plugin.t("modal.bulkImport.section.duplicateExisting"),
			entries.length,
		);
		section.createEl("p", {
			cls: "twofa-bulk-import-section__description",
			text: this.plugin.t("modal.bulkImport.section.duplicateExistingDescription"),
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
				this.state.toggleDuplicateSelection(entry.lineNumber, checkbox.checked);
				this.updateImportButtonState();
			});

			const body = label.createDiv({
				cls: "twofa-bulk-import-checkbox__body",
			});
			this.renderItemHeader(body, entry.entry, entry.lineNumber);
			body.createEl("div", {
				cls: "twofa-bulk-import-item__meta",
				text: this.plugin.t("modal.bulkImport.row.existing", {
					label: this.formatEntryLabel(entry.existingEntry),
				}),
			});
			body.createEl("div", {
				cls: "twofa-bulk-import-item__meta",
				text: this.plugin.t("modal.bulkImport.action.replace"),
			});
			this.renderRawLine(body, entry.rawLine);
		}
	}

	private renderDuplicateBatchSection(
		entries: readonly BulkOtpauthImportDuplicateBatchEntry[],
	): void {
		if (!this.resultsEl || entries.length === 0) {
			return;
		}

		const section = this.createSection(
			this.plugin.t("modal.bulkImport.section.duplicateBatch"),
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
				text: this.plugin.t("modal.bulkImport.row.firstSeen", {
					lineNumber: entry.firstLineNumber,
				}),
			});
			this.renderRawLine(item, entry.rawLine);
		}
	}

	private renderInvalidSection(entries: readonly BulkOtpauthImportInvalidEntry[]): void {
		if (!this.resultsEl || entries.length === 0) {
			return;
		}

		const section = this.createSection(this.plugin.t("modal.bulkImport.section.invalid"), entries.length);
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
				text: this.plugin.t("modal.bulkImport.row.line", {
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

	private createSection(title: string, count: number): HTMLElement {
		const section = this.resultsEl!.createDiv({
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
			text: this.formatEntryLabel(entry),
		});
		header.createEl("span", {
			cls: "twofa-bulk-import-item__line",
			text: this.plugin.t("modal.bulkImport.row.line", {
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

	private formatEntryLabel(entry: Pick<TotpEntryDraft, "issuer" | "accountName">): string {
		return formatBulkImportEntryLabel(entry);
	}

	private updateImportButtonState(): void {
		this.importButton?.setDisabled(this.state.isImportDisabled());
	}

	private setStatus(message: string, isError: boolean): void {
		if (!this.statusEl) {
			return;
		}

		this.statusEl.setText(message);
		this.statusEl.toggleClass("is-error", isError);
		this.statusEl.toggleClass("is-success", !isError && message.length > 0);
	}

	private finish(result: BulkOtpauthImportModalResult | null): void {
		if (this.settled) {
			return;
		}

		this.settled = true;
		this.resolve(result);
		this.close();
	}
}

export function openBulkOtpauthImportModal(
	plugin: TwoFactorManagementPlugin,
	existingEntries: readonly TotpEntryRecord[],
): Promise<BulkOtpauthImportModalResult | null> {
	return new Promise((resolve) => {
		new BulkOtpauthImportModal(plugin, existingEntries, resolve).open();
	});
}
