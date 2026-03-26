import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { runGuardedAction } from "./application/action-runner";
import type { SettingsActions } from "./application/contracts";

export class TwoFactorSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly controller: SettingsActions,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName(this.controller.t("settings.heading")).setHeading();
		containerEl.createEl("p", {
			text: this.controller.t("settings.description"),
		});

		new Setting(containerEl)
			.setName(this.controller.t("settings.preferredSidebar.name"))
			.setDesc(this.controller.t("settings.preferredSidebar.description"))
			.addDropdown((dropdown) => {
				dropdown.addOptions({
					right: this.controller.t("settings.preferredSidebar.right"),
					left: this.controller.t("settings.preferredSidebar.left"),
				});
				dropdown.setValue(this.controller.getPreferredSide());
				dropdown.onChange((value) => {
					void this.runGuardedTask(
						() =>
							this.controller.setPreferredSide(
								value === "left" ? "left" : "right",
							),
						{
							redisplayOnFailure: true,
						},
					);
				});
			});

		new Setting(containerEl)
			.setName(this.controller.t("settings.showUpcomingCodes.name"))
			.setDesc(this.controller.t("settings.showUpcomingCodes.description"))
			.addToggle((toggle) => {
				toggle
					.setValue(this.controller.shouldShowUpcomingCodes())
					.onChange((value) => {
						void this.runGuardedTask(
							() => this.controller.setShowUpcomingCodes(value),
							{
								redisplayOnFailure: true,
							},
						);
					});
			});

		new Setting(containerEl)
			.setName(this.controller.t("settings.openView.name"))
			.setDesc(this.controller.t("settings.openView.description"))
			.addButton((button) => {
				button.setButtonText(this.controller.t("common.openView")).onClick(() => {
					void this.runGuardedTask(() => this.controller.open2FAView());
				});
			});

		if (this.controller.hasVaultLoadIssue()) {
			new Setting(containerEl)
				.setName(this.controller.t("settings.repair.heading"))
				.setHeading();
			containerEl.createEl("p", {
				text: this.controller.t("settings.repair.description"),
			});
			new Setting(containerEl)
				.setName(this.controller.t("settings.repair.clearVault.name"))
				.setDesc(this.controller.t("settings.repair.clearVault.description"))
				.addButton((button) => {
					button
						.setButtonText(this.controller.t("common.clearVault"))
						.setWarning()
						.onClick(() => {
							void this.runGuardedTask(() => this.handleResetVault());
						});
				});
			return;
		}

		if (!this.controller.isVaultInitialized()) {
			new Setting(containerEl)
				.setName(this.controller.t("settings.createVault.name"))
				.setDesc(this.controller.t("settings.createVault.description"))
				.addButton((button) => {
					button
						.setButtonText(this.controller.t("common.createVault"))
						.setCta()
						.onClick(() => {
							void this.runGuardedTask(() => this.handleInitializeVault());
						});
				});
			return;
		}

		new Setting(containerEl)
			.setName(this.controller.t("settings.vaultLifecycle.heading"))
			.setHeading();

		new Setting(containerEl)
			.setName(
				this.controller.isUnlocked()
					? this.controller.t("settings.unlockStatus.unlocked.name")
					: this.controller.t("settings.unlockStatus.locked.name"),
			)
			.setDesc(
				this.controller.isUnlocked()
					? this.controller.t("settings.unlockStatus.unlocked.description")
					: this.controller.t("settings.unlockStatus.locked.description"),
			)
			.addButton((button) => {
				if (this.controller.isUnlocked()) {
					button.setButtonText(this.controller.t("common.lockNow")).onClick(() => {
						this.controller.lockVault(true);
						this.display();
					});
					return;
				}

				button
					.setButtonText(this.controller.t("common.unlockVault"))
					.setCta()
					.onClick(() => {
						void this.runGuardedTask(() => this.handleUnlockVault());
					});
			});

		new Setting(containerEl)
			.setName(this.controller.t("settings.changePassword.name"))
			.setDesc(this.controller.t("settings.changePassword.description"))
			.addButton((button) => {
				button.setButtonText(this.controller.t("common.changePassword")).onClick(() => {
					void this.runGuardedTask(() => this.handleChangePassword());
				});
			});

		new Setting(containerEl)
			.setName(this.controller.t("settings.dangerZone.heading"))
			.setHeading();

		new Setting(containerEl)
			.setName(this.controller.t("settings.clearVault.name"))
			.setDesc(this.controller.t("settings.clearVault.description"))
			.addButton((button) => {
				button
					.setButtonText(this.controller.t("common.clearVault"))
					.setWarning()
					.onClick(() => {
						void this.runGuardedTask(() => this.handleResetVault());
					});
			});
	}

	private async runGuardedTask(
		task: () => Promise<unknown>,
		options: {
			redisplayOnFailure?: boolean;
		} = {},
	): Promise<boolean> {
		return runGuardedAction(this.controller, task, {
			onError: () => {
				if (options.redisplayOnFailure) {
					this.display();
				}
			},
		});
	}

	private async handleInitializeVault(): Promise<void> {
		const didInitialize = await this.controller.promptToInitializeVault();

		if (didInitialize) {
			this.display();
		}
	}

	private async handleUnlockVault(): Promise<void> {
		const didUnlock = await this.controller.promptToUnlockVault();

		if (didUnlock) {
			this.display();
		}
	}

	private async handleChangePassword(): Promise<void> {
		if (!this.controller.isUnlocked()) {
			new Notice(this.controller.t("notice.unlockBeforePasswordChange"));
			return;
		}

		const didChange = await this.controller.promptToChangeMasterPassword();

		if (didChange) {
			this.display();
		}
	}

	private async handleResetVault(): Promise<void> {
		const didReset = await this.controller.confirmAndResetVault();

		if (didReset) {
			this.display();
		}
	}
}
