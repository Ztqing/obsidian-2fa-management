import { ButtonComponent, Modal, Setting, TextAreaComponent } from "obsidian";
import { createBulkOtpauthImportPreview } from "../../import/bulk-otpauth";
import type { BulkOtpauthImportSubmission, TotpEntryRecord } from "../../types";
import type TwoFactorManagementPlugin from "../../plugin";
import { BulkImportPreviewRenderer } from "./bulk-import-preview-renderer";
import { BulkOtpauthImportModalState } from "./bulk-otpauth-import-state";

export type BulkOtpauthImportModalResult = Omit<
	BulkOtpauthImportSubmission,
	"expectedVaultRevision"
> & {
	expectedVaultRevision?: number;
};

class BulkOtpauthImportModal extends Modal {
	private readonly plugin: TwoFactorManagementPlugin;
	private readonly existingEntries: readonly TotpEntryRecord[];
	private readonly expectedVaultRevision: number;
	private readonly resolve: (result: BulkOtpauthImportModalResult | null) => void;
	private sourceInput: TextAreaComponent | null = null;
	private statusEl: HTMLElement | null = null;
	private resultsEl: HTMLElement | null = null;
	private importButton: ButtonComponent | null = null;
	private settled = false;
	private readonly state: BulkOtpauthImportModalState;
	private readonly previewRenderer: BulkImportPreviewRenderer;

	constructor(
		plugin: TwoFactorManagementPlugin,
		existingEntries: readonly TotpEntryRecord[],
		expectedVaultRevision: number,
		resolve: (result: BulkOtpauthImportModalResult | null) => void,
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.existingEntries = existingEntries;
		this.expectedVaultRevision = expectedVaultRevision;
		this.resolve = resolve;
		this.state = new BulkOtpauthImportModalState(expectedVaultRevision);
		this.previewRenderer = new BulkImportPreviewRenderer(
			this.plugin,
			this.state,
			(lineNumber, isSelected) => {
				this.state.toggleDuplicateSelection(lineNumber, isSelected);
				this.updateImportButtonState();
			},
		);
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
				this.handlePreview();
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

	private handlePreview(): void {
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

		this.previewRenderer.renderSummary(this.resultsEl, preview.stats);
		this.previewRenderer.render(this.resultsEl);
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
	expectedVaultRevision: number,
): Promise<BulkOtpauthImportModalResult | null> {
	return new Promise((resolve) => {
		new BulkOtpauthImportModal(
			plugin,
			existingEntries,
			expectedVaultRevision,
			resolve,
		).open();
	});
}
