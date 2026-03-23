import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type TwoFactorManagementPlugin from "./plugin";

export class TwoFactorSettingTab extends PluginSettingTab {
	private readonly plugin: TwoFactorManagementPlugin;

	constructor(app: App, plugin: TwoFactorManagementPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName(this.plugin.t("settings.heading")).setHeading();
		containerEl.createEl("p", {
			text: this.plugin.t("settings.description"),
		});

		new Setting(containerEl)
			.setName(this.plugin.t("settings.preferredSidebar.name"))
			.setDesc(this.plugin.t("settings.preferredSidebar.description"))
			.addDropdown((dropdown) => {
				dropdown.addOptions({
					right: this.plugin.t("settings.preferredSidebar.right"),
					left: this.plugin.t("settings.preferredSidebar.left"),
				});
				dropdown.setValue(this.plugin.getPreferredSide());
				dropdown.onChange((value) => {
					void this.plugin.setPreferredSide(value === "left" ? "left" : "right");
				});
			});

		new Setting(containerEl)
			.setName(this.plugin.t("settings.openView.name"))
			.setDesc(this.plugin.t("settings.openView.description"))
			.addButton((button) => {
				button.setButtonText(this.plugin.t("common.openView")).onClick(() => {
					void this.plugin.open2FAView();
				});
			});

		if (!this.plugin.isVaultInitialized()) {
			new Setting(containerEl)
				.setName(this.plugin.t("settings.createVault.name"))
				.setDesc(this.plugin.t("settings.createVault.description"))
				.addButton((button) => {
					button.setButtonText(this.plugin.t("common.createVault")).setCta().onClick(() => {
						void this.handleInitializeVault();
					});
				});
			return;
		}

		new Setting(containerEl).setName(this.plugin.t("settings.vaultLifecycle.heading")).setHeading();

		new Setting(containerEl)
			.setName(
				this.plugin.isUnlocked()
					? this.plugin.t("settings.unlockStatus.unlocked.name")
					: this.plugin.t("settings.unlockStatus.locked.name"),
			)
			.setDesc(
				this.plugin.isUnlocked()
					? this.plugin.t("settings.unlockStatus.unlocked.description")
					: this.plugin.t("settings.unlockStatus.locked.description"),
			)
			.addButton((button) => {
				if (this.plugin.isUnlocked()) {
					button.setButtonText(this.plugin.t("common.lockNow")).onClick(() => {
						this.plugin.lockVault(true);
						this.display();
					});
					return;
				}

				button.setButtonText(this.plugin.t("common.unlockVault")).setCta().onClick(() => {
					void this.handleUnlockVault();
				});
			});

		new Setting(containerEl)
			.setName(this.plugin.t("settings.changePassword.name"))
			.setDesc(this.plugin.t("settings.changePassword.description"))
			.addButton((button) => {
				button.setButtonText(this.plugin.t("common.changePassword")).onClick(() => {
					void this.handleChangePassword();
				});
			});

		new Setting(containerEl).setName(this.plugin.t("settings.dangerZone.heading")).setHeading();

		new Setting(containerEl)
			.setName(this.plugin.t("settings.clearVault.name"))
			.setDesc(this.plugin.t("settings.clearVault.description"))
			.addButton((button) => {
				button.setButtonText(this.plugin.t("common.clearVault")).setWarning().onClick(() => {
					void this.handleResetVault();
				});
			});
	}

	private async handleInitializeVault(): Promise<void> {
		const didInitialize = await this.plugin.promptToInitializeVault();
		if (didInitialize) {
			this.display();
		}
	}

	private async handleUnlockVault(): Promise<void> {
		const didUnlock = await this.plugin.promptToUnlockVault();
		if (didUnlock) {
			this.display();
		}
	}

	private async handleChangePassword(): Promise<void> {
		if (!this.plugin.isUnlocked()) {
			new Notice(this.plugin.t("notice.unlockBeforePasswordChange"));
			return;
		}

		const didChange = await this.plugin.promptToChangeMasterPassword();
		if (didChange) {
			this.display();
		}
	}

	private async handleResetVault(): Promise<void> {
		const didReset = await this.plugin.confirmAndResetVault();
		if (didReset) {
			this.display();
		}
	}
}
