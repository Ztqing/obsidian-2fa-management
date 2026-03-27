import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TextComponent,
} from "obsidian";
import { runGuardedAction } from "./application/action-runner";
import {
	applyLockTimeoutModeSelection,
	getLockTimeoutDescriptionTranslationKey,
	getLockTimeoutModeOptionTranslationKeys,
	getNeverModeWarningTranslationKey,
} from "./application/lock-timeout-settings";
import type { SettingsActions } from "./application/contracts";
import type { LockTimeoutMode, PersistedUnlockCapability } from "./types";

export class TwoFactorSettingTab extends PluginSettingTab {
	private didBindActivityListeners = false;

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
		this.bindActivityListeners(containerEl);

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

		this.renderLockTimeoutSettings(containerEl);

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

	private bindActivityListeners(containerEl: HTMLElement): void {
		if (this.didBindActivityListeners) {
			return;
		}

		for (const eventName of ["change", "input", "keydown", "pointerdown"] as const) {
			containerEl.addEventListener(eventName, () => {
				this.controller.recordSessionActivity();
			});
		}

		this.didBindActivityListeners = true;
	}

	private renderLockTimeoutSettings(containerEl: HTMLElement): void {
		const currentMode = this.controller.getLockTimeoutMode();
		const capability = this.controller.getPersistedUnlockCapability();

		new Setting(containerEl)
			.setName(this.controller.t("settings.lockTimeout.name"))
			.setDesc(this.getLockTimeoutDescription(currentMode, capability))
			.addDropdown((dropdown) => {
				dropdown.addOptions(this.getLockTimeoutModeOptions(capability));
				dropdown.setValue(currentMode);
				dropdown.onChange((value) => {
					const nextMode = this.normalizeLockTimeoutMode(value);
					void applyLockTimeoutModeSelection(
						this.controller,
						currentMode,
						nextMode,
					).then((result) => {
						if (result.warningTranslationKey) {
							new Notice(this.controller.t(result.warningTranslationKey));
						}

						this.display();
					});
				});
			});

		if (capability.source !== "safe-storage") {
			const isCompatibilityFallbackEnabled =
				this.controller.isInsecurePersistedUnlockFallbackEnabled();

			new Setting(containerEl)
				.setName(
					this.controller.t(
						"settings.lockTimeout.compatibilityFallback.name",
					),
				)
				.setDesc(
					this.controller.t(
						isCompatibilityFallbackEnabled
							? "settings.lockTimeout.compatibilityFallback.enabledDescription"
							: "settings.lockTimeout.compatibilityFallback.disabledDescription",
					),
				)
				.addToggle((toggle) => {
					toggle
						.setValue(isCompatibilityFallbackEnabled)
						.onChange((value) => {
							void this.handleCompatibilityFallbackToggle(
								value,
								isCompatibilityFallbackEnabled,
							);
						});
				});
		}

		if (currentMode !== "custom") {
			return;
		}

		new Setting(containerEl)
			.setName(this.controller.t("settings.lockTimeout.customMinutes.name"))
			.setDesc(
				this.controller.t("settings.lockTimeout.customMinutes.description"),
			)
			.addText((text) => {
				text.setValue(String(this.controller.getLockTimeoutMinutes()));
				text.inputEl.inputMode = "numeric";
				text.inputEl.addEventListener("blur", () => {
					void this.commitCustomLockTimeout(text);
				});
				text.inputEl.addEventListener("keydown", (event) => {
					if (event.key !== "Enter") {
						return;
					}

					event.preventDefault();
					text.inputEl.blur();
				});
			});
	}

	private getLockTimeoutDescription(
		mode: LockTimeoutMode,
		capability: PersistedUnlockCapability,
	): string {
		return this.controller.t(
			getLockTimeoutDescriptionTranslationKey(mode, capability),
		);
	}

	private getLockTimeoutModeOptions(
		capability: PersistedUnlockCapability,
	): Record<string, string> {
		const optionKeys = getLockTimeoutModeOptionTranslationKeys(capability);
		return {
			custom: this.controller.t(optionKeys.custom),
			"on-restart": this.controller.t(optionKeys["on-restart"]),
			never: this.controller.t(optionKeys.never),
		};
	}

	private async handleCompatibilityFallbackToggle(
		nextEnabled: boolean,
		currentEnabled: boolean,
	): Promise<void> {
		if (nextEnabled === currentEnabled) {
			return;
		}

		if (nextEnabled) {
			const confirmed =
				await this.controller.confirmEnableInsecurePersistedUnlockFallback();

			if (!confirmed) {
				this.display();
				return;
			}
		}

		const didSucceed = await this.runGuardedTask(
			() =>
				this.controller.setInsecurePersistedUnlockFallbackEnabled(nextEnabled),
			{
				redisplayOnFailure: true,
			},
		);

		if (
			didSucceed &&
			nextEnabled &&
			this.controller.getLockTimeoutMode() === "never"
		) {
			const warningTranslationKey = getNeverModeWarningTranslationKey(
				this.controller.getPersistedUnlockCapability(),
			);

			if (warningTranslationKey) {
				new Notice(this.controller.t(warningTranslationKey));
			}
		}

		this.display();
	}

	private normalizeLockTimeoutMode(value: string): LockTimeoutMode {
		if (value === "custom" || value === "never") {
			return value;
		}

		return "on-restart";
	}

	private parseLockTimeoutMinutes(rawValue: string): number | null {
		if (!/^\d+$/.test(rawValue.trim())) {
			return null;
		}

		const parsed = Number(rawValue);
		return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
	}

	private async commitCustomLockTimeout(text: TextComponent): Promise<void> {
		const parsedMinutes = this.parseLockTimeoutMinutes(text.getValue());
		const currentMinutes = this.controller.getLockTimeoutMinutes();

		if (parsedMinutes === null) {
			text.setValue(String(currentMinutes));
			new Notice(this.controller.t("error.lockTimeoutMinutesInvalid"));
			return;
		}

		if (parsedMinutes === currentMinutes) {
			text.setValue(String(parsedMinutes));
			return;
		}

		const didSucceed = await this.runGuardedTask(
			() => this.controller.setLockTimeoutMinutes(parsedMinutes),
			{
				redisplayOnFailure: true,
			},
		);

		text.setValue(String(this.controller.getLockTimeoutMinutes()));

		if (didSucceed) {
			this.display();
		}
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
