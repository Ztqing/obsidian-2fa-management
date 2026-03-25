import { MIN_MASTER_PASSWORD_LENGTH } from "../security/master-password";
import { clearSharedPreparedTotpEntryCache } from "../totp/totp";
import type { TwoFactorPluginActionEnvironment } from "./contracts";

export class VaultLifecycleService {
	constructor(private readonly environment: TwoFactorPluginActionEnvironment) {}

	lockVault(showNotice = false): void {
		this.environment.service.lockVault();
		clearSharedPreparedTotpEntryCache();
		if (showNotice) {
			this.environment.showNotice?.(this.environment.t("notice.vaultLocked"));
		}
		void this.environment.refreshAllViews("availability");
	}

	async promptToInitializeVault(): Promise<boolean> {
		if (this.ensureVaultRepairNotRequired()) {
			return false;
		}

		if (this.environment.service.isVaultInitialized()) {
			this.environment.showNotice?.(this.environment.t("notice.vaultExists"));
			return false;
		}

		const password = await this.environment.promptForMasterPassword({
			title: this.environment.t("prompt.createVault.title"),
			description: this.environment.t("prompt.createVault.description"),
			submitLabel: this.environment.t("prompt.createVault.submit"),
			minimumLength: MIN_MASTER_PASSWORD_LENGTH,
			requireConfirmation: true,
		});

		if (!password) {
			return false;
		}

		await this.environment.service.initializeVault(password);
		clearSharedPreparedTotpEntryCache();
		await this.environment.open2FAView();
		await this.environment.refreshAllViews("availability");
		this.environment.showNotice?.(this.environment.t("notice.vaultCreated"));
		return true;
	}

	async promptToUnlockVault(): Promise<boolean> {
		if (this.ensureVaultRepairNotRequired()) {
			return false;
		}

		if (!this.environment.service.isVaultInitialized()) {
			this.environment.showNotice?.(this.environment.t("notice.vaultCreateFirst"));
			return false;
		}

		if (this.environment.service.isUnlocked()) {
			await this.environment.open2FAView();
			return true;
		}

		const password = await this.environment.promptForMasterPassword({
			title: this.environment.t("prompt.unlockVault.title"),
			description: this.environment.t("prompt.unlockVault.description"),
			submitLabel: this.environment.t("prompt.unlockVault.submit"),
		});

		if (!password) {
			return false;
		}

		try {
			await this.environment.service.unlockVault(password);
			await this.environment.open2FAView();
			await this.environment.refreshAllViews("availability");
			this.environment.showNotice?.(this.environment.t("notice.vaultUnlocked"));
			return true;
		} catch (error) {
			this.showErrorNotice(error);
			return false;
		}
	}

	async promptToChangeMasterPassword(): Promise<boolean> {
		if (this.ensureVaultRepairNotRequired()) {
			return false;
		}

		if (!this.environment.service.isUnlocked()) {
			this.environment.showNotice?.(
				this.environment.t("notice.unlockBeforePasswordChange"),
			);
			return false;
		}

		const nextPassword = await this.environment.promptForMasterPassword({
			title: this.environment.t("prompt.changePassword.title"),
			description: this.environment.t("prompt.changePassword.description"),
			submitLabel: this.environment.t("prompt.changePassword.submit"),
			minimumLength: MIN_MASTER_PASSWORD_LENGTH,
			requireConfirmation: true,
		});

		if (!nextPassword) {
			return false;
		}

		try {
			await this.environment.service.changeMasterPassword(nextPassword);
			this.environment.showNotice?.(
				this.environment.t("notice.masterPasswordUpdated"),
			);
			return true;
		} catch (error) {
			this.showErrorNotice(error);
			return false;
		}
	}

	async confirmAndResetVault(): Promise<boolean> {
		const confirmed = await this.environment.confirmAction({
			title: this.environment.t("confirm.clearVault.title"),
			description: this.environment.t("confirm.clearVault.description"),
			confirmLabel: this.environment.t("confirm.clearVault.confirmLabel"),
			confirmationDescription: this.environment.t(
				"confirm.clearVault.confirmationDescription",
			),
			confirmationLabel: this.environment.t("confirm.clearVault.confirmationLabel"),
			confirmationPlaceholder: this.environment.t(
				"confirm.clearVault.confirmationPlaceholder",
			),
			cancelLabel: this.environment.t("common.cancel"),
			requireTextConfirmation: "CLEAR",
			warning: true,
		});

		if (!confirmed) {
			return false;
		}

		try {
			await this.environment.service.resetVault();
			clearSharedPreparedTotpEntryCache();
			await this.environment.refreshAllViews("availability");
			this.environment.showNotice?.(this.environment.t("notice.vaultCleared"));
			return true;
		} catch (error) {
			this.showErrorNotice(error);
			return false;
		}
	}

	async ensureVaultReadyForManagement(): Promise<boolean> {
		if (this.ensureVaultRepairNotRequired()) {
			return false;
		}

		if (!this.environment.service.isVaultInitialized()) {
			const didInitialize = await this.promptToInitializeVault();
			if (!didInitialize) {
				return false;
			}
		}

		if (!this.environment.service.isUnlocked()) {
			const didUnlock = await this.promptToUnlockVault();
			if (!didUnlock) {
				return false;
			}
		}

		return true;
	}

	private ensureVaultRepairNotRequired(): boolean {
		if (!this.environment.service.hasVaultLoadIssue()) {
			return false;
		}

		this.environment.showNotice?.(this.environment.t("notice.vaultRepairRequired"));
		return true;
	}

	private showErrorNotice(error: unknown): void {
		this.environment.showNotice?.(this.environment.getErrorMessage(error));
	}
}
