import {
	Modal,
	Setting,
	TextAreaComponent,
} from "obsidian";
import { DEFAULT_TOTP_ENTRY } from "../../constants";
import { normalizeTotpEntryDraft } from "../../data/store";
import { serializeOtpauthUri } from "../../totp/otpauth";
import type { TotpEntryDraft } from "../../types";
import type TwoFactorManagementPlugin from "../../plugin";
import { TotpEntryImportSurfaceController } from "./totp-entry-modal-controller";
import {
	extractImageFileFromDataTransfer,
	extractImageFileFromItems,
} from "./totp-entry-import";
import { createTotpEntryForm, type TotpEntryForm } from "./totp-entry-form";
import { TotpEntryImportPresenter } from "./totp-entry-import-presenter";

class TotpEntryModal extends Modal {
	private readonly plugin: TwoFactorManagementPlugin;
	private readonly initialDraft: TotpEntryDraft;
	private readonly resolve: (draft: TotpEntryDraft | null) => void;
	private settled = false;
	private uriInput: TextAreaComponent | null = null;
	private statusEl: HTMLElement | null = null;
	private fileInput: HTMLInputElement | null = null;
	private readonly isEditing: boolean;
	private importSurfaceEl: HTMLElement | null = null;
	private readonly importSurfaceState = new TotpEntryImportSurfaceController();
	private form: TotpEntryForm | null = null;
	private importPresenter: TotpEntryImportPresenter | null = null;

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

		this.form = createTotpEntryForm(this.plugin, this.contentEl, this.initialDraft);
		this.importPresenter = new TotpEntryImportPresenter(
			{
				applyDraft: (draft) => {
					this.form?.applyDraft(draft);
				},
				clearImportSurfaceState: () => {
					this.clearImportSurfaceState();
				},
				getErrorMessage: (error) => this.getErrorMessage(error),
				readDraft: () => this.readDraftFromInputs(),
				setStatus: (message, isError) => {
					this.setStatus(message, isError);
				},
				setUriValue: (value) => {
					this.uriInput?.setValue(value);
				},
				showNotice: (message) => {
					this.plugin.showNotice(message);
				},
				t: (key, variables = {}) => this.plugin.t(key, variables),
			},
			this.form.getFieldElements(),
		);

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
			this.form?.focusPrimaryField();
		}, 0);
	}

	onClose(): void {
		this.contentEl.empty();
		this.importPresenter?.destroy();
		this.importSurfaceState.reset();

		if (!this.settled) {
			this.resolve(null);
		}
	}

	private readDraftFromInputs(): TotpEntryDraft {
		return this.form?.readDraft() ?? {
			...DEFAULT_TOTP_ENTRY,
		};
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
		this.importPresenter?.maybeParseUri(value);
	}

	private importFromUri(value: string, showSuccess = true): void {
		this.importPresenter?.importFromUri(value, showSuccess);
	}

	private async importQrImage(
		file: Blob,
		source: "clipboard" | "drop" | "picker" = "picker",
	): Promise<void> {
		await this.importPresenter?.importQrImage(file, source);
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

	private setImportSurfaceState(stateClassName: string): void {
		this.importSurfaceEl?.addClass(stateClassName);
	}

	private clearImportSurfaceState(): void {
		this.importSurfaceEl?.removeClass("is-active");
	}

	private syncImportSurfaceState(isActive: boolean): void {
		if (isActive) {
			this.setImportSurfaceState("is-active");
			return;
		}

		this.clearImportSurfaceState();
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
