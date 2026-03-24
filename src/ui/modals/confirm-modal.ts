import { App, Modal, Setting, TextComponent } from "obsidian";

export interface ConfirmationOptions {
	cancelLabel: string;
	title: string;
	description: string;
	confirmLabel: string;
	confirmationDescription?: string;
	confirmationLabel?: string;
	confirmationPlaceholder?: string;
	requireTextConfirmation?: string;
	warning?: boolean;
}

class ConfirmationModal extends Modal {
	private readonly options: ConfirmationOptions;
	private readonly resolve: (confirmed: boolean) => void;
	private confirmationInput: TextComponent | null = null;
	private confirmButton: HTMLButtonElement | null = null;
	private statusEl: HTMLElement | null = null;
	private settled = false;

	constructor(app: App, options: ConfirmationOptions, resolve: (confirmed: boolean) => void) {
		super(app);
		this.options = options;
		this.resolve = resolve;
	}

	onOpen(): void {
		this.titleEl.setText(this.options.title);
		this.contentEl.createEl("p", {
			text: this.options.description,
		});
		if (typeof this.options.confirmationDescription === "string") {
			this.contentEl.createEl("p", {
				text: this.options.confirmationDescription,
			});
		}
		if (typeof this.options.requireTextConfirmation === "string") {
			new Setting(this.contentEl)
				.setName(this.options.confirmationLabel ?? this.options.confirmLabel)
				.addText((text) => {
					this.confirmationInput = text;
					text.inputEl.placeholder = this.options.confirmationPlaceholder ?? "";
					text.onChange(() => {
						this.syncConfirmButtonState();
						this.setStatus("");
					});
				});
		}
		this.statusEl = this.contentEl.createDiv({
			cls: "twofa-modal-status",
		});

		const actions = new Setting(this.contentEl);
		actions.settingEl.addClass("twofa-modal-actions");
		actions.addButton((button) => {
			button.setButtonText(this.options.cancelLabel).onClick(() => {
				this.finish(false);
			});
		});
		actions.addButton((button) => {
			button.setButtonText(this.options.confirmLabel);
			if (this.options.warning) {
				button.setWarning();
			} else {
				button.setCta();
			}
			button.onClick(() => {
				if (!this.isTextConfirmationSatisfied()) {
					this.setStatus(this.options.confirmationPlaceholder ?? "", true);
					return;
				}

				this.finish(true);
			});
			this.confirmButton = button.buttonEl;
		});
		this.syncConfirmButtonState();
	}

	onClose(): void {
		this.contentEl.empty();

		if (!this.settled) {
			this.resolve(false);
		}
	}

	private finish(confirmed: boolean): void {
		if (this.settled) {
			return;
		}

		this.settled = true;
		this.resolve(confirmed);
		this.close();
	}

	private isTextConfirmationSatisfied(): boolean {
		if (typeof this.options.requireTextConfirmation !== "string") {
			return true;
		}

		return (
			this.confirmationInput?.getValue().trim() === this.options.requireTextConfirmation
		);
	}

	private setStatus(message: string, isError = false): void {
		if (!this.statusEl) {
			return;
		}

		this.statusEl.setText(message);
		this.statusEl.toggleClass("is-error", isError);
	}

	private syncConfirmButtonState(): void {
		if (!this.confirmButton) {
			return;
		}

		this.confirmButton.disabled = !this.isTextConfirmationSatisfied();
	}
}

export function confirmAction(app: App, options: ConfirmationOptions): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmationModal(app, options, resolve).open();
	});
}
