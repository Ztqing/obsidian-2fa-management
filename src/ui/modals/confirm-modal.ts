import { App, Modal, Setting } from "obsidian";

export interface ConfirmationOptions {
	cancelLabel: string;
	title: string;
	description: string;
	confirmLabel: string;
	warning?: boolean;
}

class ConfirmationModal extends Modal {
	private readonly options: ConfirmationOptions;
	private readonly resolve: (confirmed: boolean) => void;
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
				this.finish(true);
			});
		});
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
}

export function confirmAction(app: App, options: ConfirmationOptions): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmationModal(app, options, resolve).open();
	});
}
