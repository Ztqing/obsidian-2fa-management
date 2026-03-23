import { Modal, Setting, TextComponent } from "obsidian";
import type TwoFactorManagementPlugin from "../../plugin";

interface MasterPasswordPromptOptions {
	title: string;
	description: string;
	submitLabel: string;
	requireConfirmation?: boolean;
}

class MasterPasswordModal extends Modal {
	private readonly plugin: TwoFactorManagementPlugin;
	private readonly options: MasterPasswordPromptOptions;
	private readonly resolve: (password: string | null) => void;
	private passwordInput: TextComponent | null = null;
	private confirmationInput: TextComponent | null = null;
	private statusEl: HTMLElement | null = null;
	private settled = false;

	constructor(
		plugin: TwoFactorManagementPlugin,
		options: MasterPasswordPromptOptions,
		resolve: (password: string | null) => void,
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.options = options;
		this.resolve = resolve;
	}

	onOpen(): void {
		this.titleEl.setText(this.options.title);
		this.contentEl.createEl("p", {
			text: this.options.description,
		});
		this.statusEl = this.contentEl.createDiv({
			cls: "twofa-modal-status",
		});

		new Setting(this.contentEl)
			.setName(this.plugin.t("modal.masterPassword.field.name"))
			.setDesc(this.plugin.t("modal.masterPassword.field.description"))
			.addText((text) => {
				this.passwordInput = text;
				text.inputEl.type = "password";
				text.inputEl.placeholder = this.plugin.t("modal.masterPassword.field.placeholder");
				text.inputEl.autocomplete = "new-password";
				text.inputEl.addEventListener("keydown", (event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						void this.handleSubmit();
					}
				});
			});

		if (this.options.requireConfirmation) {
			new Setting(this.contentEl)
				.setName(this.plugin.t("modal.masterPassword.confirm.name"))
				.setDesc(this.plugin.t("modal.masterPassword.confirm.description"))
				.addText((text) => {
					this.confirmationInput = text;
					text.inputEl.type = "password";
					text.inputEl.placeholder = this.plugin.t("modal.masterPassword.confirm.placeholder");
					text.inputEl.autocomplete = "new-password";
					text.inputEl.addEventListener("keydown", (event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							void this.handleSubmit();
						}
					});
				});
		}

		const actions = new Setting(this.contentEl);
		actions.settingEl.addClass("twofa-modal-actions");
		actions.addButton((button) => {
			button.setButtonText(this.plugin.t("common.cancel")).onClick(() => {
				this.finish(null);
			});
		});
		actions.addButton((button) => {
			button.setButtonText(this.options.submitLabel).setCta().onClick(() => {
				void this.handleSubmit();
			});
		});

		window.setTimeout(() => {
			this.passwordInput?.inputEl.focus();
		}, 0);
	}

	onClose(): void {
		this.contentEl.empty();

		if (!this.settled) {
			this.resolve(null);
		}
	}

	private async handleSubmit(): Promise<void> {
		const password = this.passwordInput?.getValue() ?? "";
		const confirmation = this.confirmationInput?.getValue() ?? "";

		if (password.length === 0) {
			this.setStatus(this.plugin.t("modal.masterPassword.status.empty"), true);
			return;
		}

		if (this.options.requireConfirmation && password !== confirmation) {
			this.setStatus(this.plugin.t("modal.masterPassword.status.mismatch"), true);
			return;
		}

		this.finish(password);
	}

	private setStatus(message: string, isError: boolean): void {
		if (!this.statusEl) {
			return;
		}

		this.statusEl.setText(message);
		this.statusEl.toggleClass("is-error", isError);
	}

	private finish(password: string | null): void {
		if (this.settled) {
			return;
		}

		this.settled = true;
		this.resolve(password);
		this.close();
	}
}

export function promptForMasterPassword(
	plugin: TwoFactorManagementPlugin,
	options: MasterPasswordPromptOptions,
): Promise<string | null> {
	return new Promise((resolve) => {
		new MasterPasswordModal(plugin, options, resolve).open();
	});
}
