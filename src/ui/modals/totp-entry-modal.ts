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
import { parseOtpauthUri, serializeOtpauthUri } from "../../totp/otpauth";
import { parseOtpauthUriFromQrImage } from "../../totp/qr";
import type { TotpAlgorithm, TotpEntryDraft } from "../../types";
import type TwoFactorManagementPlugin from "../../plugin";
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
	private dragDepth = 0;
	private importHighlightTimeout: number | null = null;

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
		this.contentEl.createEl("p", {
			text: this.plugin.t("modal.entry.intro"),
		});
		this.statusEl = this.contentEl.createDiv({
			cls: "twofa-modal-status",
		});
		this.renderImportSurface();

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

		new Setting(this.contentEl)
			.setName(this.plugin.t("modal.entry.importLink.name"))
			.setDesc(this.plugin.t("modal.entry.importLink.description"))
			.addTextArea((text) => {
				this.uriInput = text;
				text.inputEl.rows = 3;
				text.inputEl.placeholder = this.plugin.t("modal.entry.importLink.placeholder");
				text.setValue(
					this.isEditing ? serializeOtpauthUri(this.initialDraft) : "",
				);
				text.onChange((value) => {
					void this.maybeParseUri(value);
				});
			})
			.addButton((button) => {
				button.setButtonText(this.plugin.t("common.parseLink")).onClick(() => {
					void this.importFromUri(this.uriInput?.getValue() ?? "");
				});
			});

		new Setting(this.contentEl)
			.setName(this.plugin.t("modal.entry.importImage.name"))
			.setDesc(this.plugin.t("modal.entry.importImage.description"))
			.addButton((button) => {
				button.setButtonText(this.plugin.t("common.chooseImage")).onClick(() => {
					this.fileInput?.click();
				});
			});

		const issuerSetting = new Setting(this.contentEl)
			.setName(this.plugin.t("modal.entry.issuer.name"))
			.setDesc(this.plugin.t("modal.entry.issuer.description"))
			.addText((text) => {
				this.issuerInput = text;
				text.inputEl.placeholder = this.plugin.t("modal.entry.issuer.placeholder");
				text.setValue(this.initialDraft.issuer);
			});
		this.fieldElements.issuer = this.issuerInput?.inputEl ?? issuerSetting.settingEl;

		const accountNameSetting = new Setting(this.contentEl)
			.setName(this.plugin.t("modal.entry.accountName.name"))
			.setDesc(this.plugin.t("modal.entry.accountName.description"))
			.addText((text) => {
				this.accountNameInput = text;
				text.inputEl.placeholder = this.plugin.t("modal.entry.accountName.placeholder");
				text.setValue(this.initialDraft.accountName);
			});
		this.fieldElements.accountName =
			this.accountNameInput?.inputEl ?? accountNameSetting.settingEl;

		const secretSetting = new Setting(this.contentEl)
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

		const algorithmSetting = new Setting(this.contentEl)
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

		const digitsSetting = new Setting(this.contentEl)
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

		const periodSetting = new Setting(this.contentEl)
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
					void this.handleSubmit();
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

	private renderImportSurface(): void {
		const surface = this.contentEl.createDiv({
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
		surface.createEl("p", {
			cls: "twofa-import-surface__hint",
			text: this.plugin.t("modal.entry.importImage.surfaceHint"),
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

	private async maybeParseUri(value: string): Promise<void> {
		const trimmedValue = value.trim();

		if (!trimmedValue.startsWith("otpauth://")) {
			this.setStatus("", false);
			return;
		}

		if (!trimmedValue.includes("secret=")) {
			this.setStatus(this.plugin.t("modal.entry.status.partialLink"), false);
			return;
		}

		await this.importFromUri(trimmedValue, false);
	}

	private async importFromUri(value: string, showSuccess = true): Promise<void> {
		try {
			const currentDraft = this.readDraftFromInputs();
			const parsedDraft = parseOtpauthUri(value);
			this.applyDraft(parsedDraft);
			this.highlightChangedFields(currentDraft, parsedDraft);
			this.setStatus(this.plugin.t("modal.entry.status.importedLink"), false);
			if (showSuccess) {
				new Notice(this.plugin.t("notice.linkImported"));
			}
		} catch (error) {
			this.setStatus(this.getErrorMessage(error), true);
		}
	}

	private async importQrImage(
		file: Blob,
		source: "clipboard" | "drop" | "picker" = "picker",
	): Promise<void> {
		try {
			this.setStatus(this.plugin.t("modal.entry.status.readingImage"), false);
			const currentDraft = this.readDraftFromInputs();
			const uri = await parseOtpauthUriFromQrImage(file);
			const parsedDraft = parseOtpauthUri(uri);
			this.uriInput?.setValue(uri);
			this.applyDraft(parsedDraft);
			this.highlightChangedFields(currentDraft, parsedDraft);
			this.setStatus(
				this.plugin.t(
					source === "clipboard"
						? "modal.entry.status.importedPastedImage"
						: source === "drop"
							? "modal.entry.status.importedDroppedImage"
							: "modal.entry.status.importedImage",
				),
				false,
			);
			new Notice(this.plugin.t("notice.imageImported"));
		} catch (error) {
			this.clearImportSurfaceState();
			this.setStatus(this.getErrorMessage(error), true);
		}
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
		if (!extractImageFileFromDataTransfer(event.dataTransfer)) {
			return;
		}

		event.preventDefault();
		this.dragDepth += 1;
		this.setImportSurfaceState("is-active");
	}

	private handleDragOver(event: DragEvent): void {
		if (!extractImageFileFromDataTransfer(event.dataTransfer)) {
			return;
		}

		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "copy";
		}
		this.setImportSurfaceState("is-active");
	}

	private handleDragLeave(event: DragEvent): void {
		if (!extractImageFileFromDataTransfer(event.dataTransfer)) {
			return;
		}

		event.preventDefault();
		this.dragDepth = Math.max(0, this.dragDepth - 1);

		if (this.dragDepth === 0) {
			this.clearImportSurfaceState();
		}
	}

	private async handleDrop(event: DragEvent): Promise<void> {
		const imageFile = extractImageFileFromDataTransfer(event.dataTransfer);

		if (!imageFile) {
			return;
		}

		event.preventDefault();
		this.dragDepth = 0;
		this.setImportSurfaceState("is-active");
		await this.importQrImage(imageFile, "drop");
	}

	private async handleSubmit(): Promise<void> {
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
		this.statusEl.toggleClass("is-error", isError);
		this.statusEl.toggleClass("is-success", !isError && message.length > 0);
	}

	private highlightChangedFields(previous: TotpEntryDraft, next: TotpEntryDraft): void {
		this.clearImportSurfaceState();
		this.clearImportHighlights();
		const changedFields = getChangedDraftFields(previous, next);

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
