import {
	DropdownComponent,
	Modal,
	Notice,
	Setting,
	TextAreaComponent,
	TextComponent,
} from "obsidian";
import { DEFAULT_TOTP_ENTRY } from "../../constants";
import { normalizeTotpEntryDraft } from "../../data/store";
import { serializeOtpauthUri } from "../../totp/otpauth";
import type { TotpAlgorithm, TotpEntryDraft } from "../../types";
import type TwoFactorManagementPlugin from "../../plugin";
import {
	TotpEntryImportSurfaceController,
	evaluateTotpEntryUriInput,
	importDraftFromQrImage,
	importDraftFromUri,
	type TotpEntryImportResult,
} from "./totp-entry-modal-controller";
import {
	extractImageFileFromDataTransfer,
	extractImageFileFromItems,
	getChangedDraftFields,
	type TotpEntryDraftField,
} from "./totp-entry-import";

class TotpEntryModal extends Modal {
	private readonly plugin: TwoFactorManagementPlugin;
	private readonly initialDraft: TotpEntryDraft;
	private readonly resolve: (draft: TotpEntryDraft | null) => void;
	private settled = false;
	private uriInput: TextAreaComponent | null = null;
	private issuerInput: TextComponent | null = null;
	private accountNameInput: TextComponent | null = null;
	private secretInput: TextComponent | null = null;
	private digitsInput: TextComponent | null = null;
	private periodInput: TextComponent | null = null;
	private algorithmInput: DropdownComponent | null = null;
	private statusEl: HTMLElement | null = null;
	private fileInput: HTMLInputElement | null = null;
	private readonly isEditing: boolean;
	private readonly fieldElements: Partial<Record<TotpEntryDraftField, HTMLElement>> = {};
	private importSurfaceEl: HTMLElement | null = null;
	private importHighlightTimeout: number | null = null;
	private readonly importSurfaceState = new TotpEntryImportSurfaceController();

	constructor(
		plugin: TwoFactorManagementPlugin,
		draft: TotpEntryDraft,
		resolve: (draft: TotpEntryDraft | null) => void,
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.initialDraft = draft;
		this.resolve = resolve;
		this.isEditing = draft.accountName.length > 0 || draft.secret.length > 0;
	}

	onOpen(): void {
		this.titleEl.setText(
			this.isEditing
				? this.plugin.t("modal.entry.editTitle")
				: this.plugin.t("modal.entry.addTitle"),
		);
		this.contentEl.addClass("twofa-entry-modal");

		const importSection = this.contentEl.createDiv({
			cls: "twofa-entry-modal__section twofa-entry-modal__section--import",
		});
		importSection.createEl("h4", {
			cls: "twofa-entry-modal__section-title",
			text: this.plugin.t("modal.entry.importSection"),
		});
		this.renderImportSurface(importSection);
		this.statusEl = importSection.createDiv({
			cls: "twofa-modal-status",
		});
		this.statusEl.setAttribute("role", "status");
		this.statusEl.setAttribute("aria-live", "polite");
		this.statusEl.setAttribute("aria-atomic", "true");

		this.fileInput = this.contentEl.createEl("input", {
			type: "file",
		});
		this.fileInput.accept = "image/*";
		this.fileInput.addClass("twofa-hidden-file-input");
		this.fileInput.addEventListener("change", () => {
			const file = this.fileInput?.files?.item(0);
			if (!file) {
				return;
			}

			void this.importQrImage(file);
			if (this.fileInput) {
				this.fileInput.value = "";
			}
		});

		const linkSetting = new Setting(importSection)
			.setName(this.plugin.t("modal.entry.importLink.name"))
			.setDesc(this.plugin.t("modal.entry.importLink.description"))
			.addTextArea((text) => {
				this.uriInput = text;
				text.inputEl.rows = 2;
				text.inputEl.placeholder = this.plugin.t("modal.entry.importLink.placeholder");
				text.setValue(
					this.isEditing ? serializeOtpauthUri(this.initialDraft) : "",
				);
				text.onChange((value) => {
					this.maybeParseUri(value);
				});
			});
		linkSetting.settingEl.addClass("twofa-entry-modal__link-setting");

		const detailsSection = this.contentEl.createDiv({
			cls: "twofa-entry-modal__section twofa-entry-modal__section--details",
		});
		detailsSection.createEl("h4", {
			cls: "twofa-entry-modal__section-title",
			text: this.plugin.t("modal.entry.detailsSection"),
		});

		const issuerSetting = new Setting(detailsSection)
			.setName(this.plugin.t("modal.entry.issuer.name"))
			.setDesc(this.plugin.t("modal.entry.issuer.description"))
			.addText((text) => {
				this.issuerInput = text;
				text.inputEl.placeholder = this.plugin.t("modal.entry.issuer.placeholder");
				text.setValue(this.initialDraft.issuer);
			});
		this.fieldElements.issuer = this.issuerInput?.inputEl ?? issuerSetting.settingEl;

		const accountNameSetting = new Setting(detailsSection)
			.setName(this.plugin.t("modal.entry.accountName.name"))
			.setDesc(this.plugin.t("modal.entry.accountName.description"))
			.addText((text) => {
				this.accountNameInput = text;
				text.inputEl.placeholder = this.plugin.t("modal.entry.accountName.placeholder");
				text.setValue(this.initialDraft.accountName);
			});
		this.fieldElements.accountName =
			this.accountNameInput?.inputEl ?? accountNameSetting.settingEl;

		const secretSetting = new Setting(detailsSection)
			.setName(this.plugin.t("modal.entry.secret.name"))
			.setDesc(this.plugin.t("modal.entry.secret.description"))
			.addText((text) => {
				this.secretInput = text;
				text.inputEl.type = "password";
				text.inputEl.placeholder = this.plugin.t("modal.entry.secret.placeholder");
				text.inputEl.autocomplete = "off";
				text.setValue(this.initialDraft.secret);
			});
		this.fieldElements.secret = this.secretInput?.inputEl ?? secretSetting.settingEl;

		const algorithmSetting = new Setting(detailsSection)
			.setName(this.plugin.t("modal.entry.algorithm.name"))
			.setDesc(this.plugin.t("modal.entry.algorithm.description"))
			.addDropdown((dropdown) => {
				this.algorithmInput = dropdown;
				dropdown.addOptions({
					"SHA-1": "SHA-1",
					"SHA-256": "SHA-256",
					"SHA-512": "SHA-512",
				});
				dropdown.setValue(this.initialDraft.algorithm);
			});
		this.fieldElements.algorithm =
			this.algorithmInput?.selectEl ?? algorithmSetting.settingEl;

		const digitsSetting = new Setting(detailsSection)
			.setName(this.plugin.t("modal.entry.digits.name"))
			.setDesc(this.plugin.t("modal.entry.digits.description"))
			.addText((text) => {
				this.digitsInput = text;
				text.inputEl.type = "number";
				text.inputEl.min = "6";
				text.inputEl.max = "10";
				text.setValue(String(this.initialDraft.digits));
			});
		this.fieldElements.digits = this.digitsInput?.inputEl ?? digitsSetting.settingEl;

		const periodSetting = new Setting(detailsSection)
			.setName(this.plugin.t("modal.entry.period.name"))
			.setDesc(this.plugin.t("modal.entry.period.description"))
			.addText((text) => {
				this.periodInput = text;
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.max = "300";
				text.setValue(String(this.initialDraft.period));
			});
		this.fieldElements.period = this.periodInput?.inputEl ?? periodSetting.settingEl;

		this.modalEl.addEventListener("paste", (event) => {
			void this.handlePaste(event);
		});
		this.modalEl.addEventListener("dragenter", (event) => {
			this.handleDragEnter(event);
		});
		this.modalEl.addEventListener("dragover", (event) => {
			this.handleDragOver(event);
		});
		this.modalEl.addEventListener("dragleave", (event) => {
			this.handleDragLeave(event);
		});
		this.modalEl.addEventListener("drop", (event) => {
			void this.handleDrop(event);
		});

		const actions = new Setting(this.contentEl);
		actions.settingEl.addClass("twofa-modal-actions");
		actions.addButton((button) => {
			button.setButtonText(this.plugin.t("common.cancel")).onClick(() => {
				this.finish(null);
			});
		});
		actions.addButton((button) => {
			button
				.setButtonText(
					this.isEditing
						? this.plugin.t("common.saveChanges")
						: this.plugin.t("common.addEntry"),
				)
				.setCta()
				.onClick(() => {
					this.handleSubmit();
				});
		});

		window.setTimeout(() => {
			this.accountNameInput?.inputEl.focus();
		}, 0);
	}

	onClose(): void {
		this.contentEl.empty();
		if (this.importHighlightTimeout !== null) {
			window.clearTimeout(this.importHighlightTimeout);
			this.importHighlightTimeout = null;
		}
		this.importSurfaceState.reset();

		if (!this.settled) {
			this.resolve(null);
		}
	}

	private readDraftFromInputs(): TotpEntryDraft {
		return {
			issuer: this.issuerInput?.getValue() ?? "",
			accountName: this.accountNameInput?.getValue() ?? "",
			secret: this.secretInput?.getValue() ?? "",
			algorithm: (this.algorithmInput?.getValue() ?? DEFAULT_TOTP_ENTRY.algorithm) as TotpAlgorithm,
			digits: Number(this.digitsInput?.getValue() ?? DEFAULT_TOTP_ENTRY.digits),
			period: Number(this.periodInput?.getValue() ?? DEFAULT_TOTP_ENTRY.period),
		};
	}

	private applyDraft(draft: TotpEntryDraft): void {
		this.issuerInput?.setValue(draft.issuer);
		this.accountNameInput?.setValue(draft.accountName);
		this.secretInput?.setValue(draft.secret);
		this.algorithmInput?.setValue(draft.algorithm);
		this.digitsInput?.setValue(String(draft.digits));
		this.periodInput?.setValue(String(draft.period));
	}

	private renderImportSurface(containerEl: HTMLElement): void {
		const surface = containerEl.createDiv({
			cls: "twofa-import-surface",
		});
		surface.tabIndex = 0;
		surface.setAttribute("role", "button");
		surface.setAttribute("aria-label", this.plugin.t("modal.entry.importImage.surfaceLabel"));
		surface.createEl("div", {
			cls: "twofa-import-surface__title",
			text: this.plugin.t("modal.entry.importImage.surfaceTitle"),
		});
		surface.createEl("p", {
			cls: "twofa-import-surface__description",
			text: this.plugin.t("modal.entry.importImage.surfaceDescription"),
		});
		surface.createEl("div", {
			cls: "twofa-import-surface__action",
			text: this.plugin.t("common.chooseImage"),
		});
		surface.addEventListener("click", () => {
			this.fileInput?.click();
		});
		surface.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") {
				return;
			}

			event.preventDefault();
			this.fileInput?.click();
		});
		this.importSurfaceEl = surface;
	}

	private maybeParseUri(value: string): void {
		const uriState = evaluateTotpEntryUriInput(value);

		if (uriState.kind === "ignore") {
			this.setStatus("", false);
			return;
		}

		if (uriState.kind === "partial") {
			this.setStatus(this.plugin.t(uriState.statusKey), false);
			return;
		}

		const result = importDraftFromUri(this.readDraftFromInputs(), uriState.value, {
			dependencies: {
				formatErrorMessage: (error) => this.getErrorMessage(error),
				getChangedDraftFields,
			},
			showSuccessNotice: false,
		});
		this.applyImportResult(result);
	}

	private importFromUri(value: string, showSuccess = true): void {
		const result = importDraftFromUri(this.readDraftFromInputs(), value, {
			dependencies: {
				formatErrorMessage: (error) => this.getErrorMessage(error),
				getChangedDraftFields,
			},
			showSuccessNotice: showSuccess,
		});
		this.applyImportResult(result);
	}

	private async importQrImage(
		file: Blob,
		source: "clipboard" | "drop" | "picker" = "picker",
	): Promise<void> {
		this.setStatus(this.plugin.t("modal.entry.status.readingImage"), false);
		const result = await importDraftFromQrImage(
			this.readDraftFromInputs(),
			file,
			source,
			{
				dependencies: {
					formatErrorMessage: (error) => this.getErrorMessage(error),
					getChangedDraftFields,
				},
			},
		);
		this.applyImportResult(result);
	}

	private async handlePaste(event: ClipboardEvent): Promise<void> {
		const imageFile = extractImageFileFromItems(event.clipboardData?.items ?? []);

		if (!imageFile) {
			return;
		}

		event.preventDefault();
		this.setImportSurfaceState("is-active");
		await this.importQrImage(imageFile, "clipboard");
	}

	private handleDragEnter(event: DragEvent): void {
		const surfaceChange = this.importSurfaceState.handleDragEnter(
			Boolean(extractImageFileFromDataTransfer(event.dataTransfer)),
		);

		if (!surfaceChange.preventDefault) {
			return;
		}

		event.preventDefault();
		this.syncImportSurfaceState(surfaceChange.active);
	}

	private handleDragOver(event: DragEvent): void {
		const surfaceChange = this.importSurfaceState.handleDragOver(
			Boolean(extractImageFileFromDataTransfer(event.dataTransfer)),
		);

		if (!surfaceChange.preventDefault) {
			return;
		}

		event.preventDefault();
		if (event.dataTransfer && surfaceChange.acceptsImage) {
			event.dataTransfer.dropEffect = "copy";
		}
		this.syncImportSurfaceState(surfaceChange.active);
	}

	private handleDragLeave(event: DragEvent): void {
		const surfaceChange = this.importSurfaceState.handleDragLeave(
			Boolean(extractImageFileFromDataTransfer(event.dataTransfer)),
		);

		if (!surfaceChange.preventDefault) {
			return;
		}

		event.preventDefault();
		this.syncImportSurfaceState(surfaceChange.active);
	}

	private async handleDrop(event: DragEvent): Promise<void> {
		const imageFile = extractImageFileFromDataTransfer(event.dataTransfer);
		const surfaceChange = this.importSurfaceState.handleDrop(Boolean(imageFile));

		if (!surfaceChange.preventDefault || !imageFile) {
			return;
		}

		event.preventDefault();
		this.syncImportSurfaceState(surfaceChange.active);
		await this.importQrImage(imageFile, "drop");
	}

	private handleSubmit(): void {
		try {
			const normalizedDraft = normalizeTotpEntryDraft(this.readDraftFromInputs());
			this.finish(normalizedDraft);
		} catch (error) {
			this.setStatus(this.getErrorMessage(error), true);
		}
	}

	private getErrorMessage(error: unknown): string {
		return this.plugin.getErrorMessage(error);
	}

	private setStatus(message: string, isError: boolean): void {
		if (!this.statusEl) {
			return;
		}

		this.statusEl.setText(message);
		this.statusEl.setAttribute("aria-live", isError ? "assertive" : "polite");
		this.statusEl.toggleClass("is-error", isError);
		this.statusEl.toggleClass("is-success", !isError && message.length > 0);
	}

	private highlightChangedFields(previous: TotpEntryDraft, next: TotpEntryDraft): void {
		this.highlightFields(getChangedDraftFields(previous, next));
	}

	private clearImportHighlights(): void {
		if (this.importHighlightTimeout !== null) {
			window.clearTimeout(this.importHighlightTimeout);
			this.importHighlightTimeout = null;
		}

		for (const element of Object.values(this.fieldElements)) {
			element?.removeClass("twofa-import-highlight");
		}
	}

	private setImportSurfaceState(stateClassName: string): void {
		this.importSurfaceEl?.addClass(stateClassName);
	}

	private clearImportSurfaceState(): void {
		this.importSurfaceEl?.removeClass("is-active");
	}

	private applyImportResult(result: TotpEntryImportResult): void {
		if (result.kind === "error") {
			if (result.clearImportSurface) {
				this.clearImportSurfaceState();
			}
			this.setStatus(result.message, true);
			return;
		}

		if (result.uri) {
			this.uriInput?.setValue(result.uri);
		}
		this.applyDraft(result.draft);
		this.highlightFields(result.changedFields);
		this.setStatus(this.plugin.t(result.statusKey), false);
		if (result.noticeKey) {
			new Notice(this.plugin.t(result.noticeKey));
		}
	}

	private syncImportSurfaceState(isActive: boolean): void {
		if (isActive) {
			this.setImportSurfaceState("is-active");
			return;
		}

		this.clearImportSurfaceState();
	}

	private highlightFields(changedFields: readonly TotpEntryDraftField[]): void {
		this.clearImportSurfaceState();
		this.clearImportHighlights();

		if (changedFields.length === 0) {
			return;
		}

		for (const field of changedFields) {
			this.fieldElements[field]?.addClass("twofa-import-highlight");
		}

		this.importHighlightTimeout = window.setTimeout(() => {
			this.clearImportHighlights();
		}, 1800);
	}

	private finish(draft: TotpEntryDraft | null): void {
		if (this.settled) {
			return;
		}

		this.settled = true;
		this.resolve(draft);
		this.close();
	}
}

export function openTotpEntryModal(
	plugin: TwoFactorManagementPlugin,
	initialDraft?: Partial<TotpEntryDraft>,
): Promise<TotpEntryDraft | null> {
	const draft: TotpEntryDraft = {
		...DEFAULT_TOTP_ENTRY,
		...initialDraft,
	};

	return new Promise((resolve) => {
		new TotpEntryModal(plugin, draft, resolve).open();
	});
}
