import { Notice, Plugin, getLanguage, type WorkspaceLeaf } from "obsidian";
import { registerPluginCommands } from "./commands";
import { OBSIDIAN_2FA_VIEW } from "./constants";
import { USER_ERROR_TRANSLATION_KEYS, isTwoFaUserError } from "./errors";
import { resolveUiLocale } from "./i18n/language";
import { type TranslationKey, translateUiString } from "./i18n/translations";
import { TwoFactorSettingTab } from "./settings";
import type {
	PreferredSide,
	TotpEntryRecord,
	TranslationVariables,
	UiLocale,
} from "./types";
import { createRandomId } from "./utils/id";
import { openBulkOtpauthImportModal } from "./ui/modals/bulk-otpauth-import-modal";
import { confirmAction } from "./ui/modals/confirm-modal";
import { promptForMasterPassword } from "./ui/modals/master-password-modal";
import { openTotpEntryModal } from "./ui/modals/totp-entry-modal";
import { TotpManagerView } from "./ui/views/totp-manager-view";
import { TwoFactorVaultService } from "./vault/service";

export default class TwoFactorManagementPlugin extends Plugin {
	private readonly vaultService = new TwoFactorVaultService({
		createId: () => createRandomId(),
		loadData: async () => {
			const data: unknown = await this.loadData();
			return data;
		},
		saveData: async (data) => {
			await this.saveData(data);
		},
	});

	async onload(): Promise<void> {
		await this.vaultService.load();
		this.registerView(OBSIDIAN_2FA_VIEW, (leaf) => new TotpManagerView(leaf, this));
		this.addSettingTab(new TwoFactorSettingTab(this.app, this));
		registerPluginCommands(this);
	}

	onunload(): void {
		this.vaultService.lockVault();
	}

	getUiLocale(): UiLocale {
		return resolveUiLocale(getLanguage());
	}

	t(key: TranslationKey, variables: TranslationVariables = {}): string {
		return translateUiString(this.getUiLocale(), key, variables);
	}

	getErrorMessage(error: unknown): string {
		if (isTwoFaUserError(error)) {
			return this.t(USER_ERROR_TRANSLATION_KEYS[error.code], error.params);
		}

		return this.t("error.unexpected");
	}

	isVaultInitialized(): boolean {
		return this.vaultService.isVaultInitialized();
	}

	isUnlocked(): boolean {
		return this.vaultService.isUnlocked();
	}

	getEntries(): TotpEntryRecord[] {
		return this.vaultService.getEntries();
	}

	getPreferredSide(): PreferredSide {
		return this.vaultService.getPreferredSide();
	}

	async setPreferredSide(side: PreferredSide): Promise<void> {
		await this.vaultService.setPreferredSide(side);
	}

	shouldShowUpcomingCodes(): boolean {
		return this.vaultService.shouldShowUpcomingCodes();
	}

	async setShowUpcomingCodes(value: boolean): Promise<void> {
		await this.vaultService.setShowUpcomingCodes(value);
		await this.refreshAllViews();
	}

	async open2FAView(): Promise<WorkspaceLeaf> {
		const leaf = await this.app.workspace.ensureSideLeaf(
			OBSIDIAN_2FA_VIEW,
			this.getPreferredSide(),
			{
				active: true,
				reveal: true,
			},
		);
		await leaf.setViewState({
			type: OBSIDIAN_2FA_VIEW,
			active: true,
		});
		await this.app.workspace.revealLeaf(leaf);
		return leaf;
	}

	lockVault(showNotice = false): void {
		this.vaultService.lockVault();
		if (showNotice) {
			new Notice(this.t("notice.vaultLocked"));
		}
		void this.refreshAllViews();
	}

	async promptToInitializeVault(): Promise<boolean> {
		if (this.isVaultInitialized()) {
			new Notice(this.t("notice.vaultExists"));
			return false;
		}

		const password = await promptForMasterPassword(this, {
			title: this.t("prompt.createVault.title"),
			description: this.t("prompt.createVault.description"),
			submitLabel: this.t("prompt.createVault.submit"),
			requireConfirmation: true,
		});

		if (!password) {
			return false;
		}

		await this.vaultService.initializeVault(password);
		await this.open2FAView();
		await this.refreshAllViews();
		new Notice(this.t("notice.vaultCreated"));
		return true;
	}

	async promptToUnlockVault(): Promise<boolean> {
		if (!this.isVaultInitialized()) {
			new Notice(this.t("notice.vaultCreateFirst"));
			return false;
		}

		if (this.isUnlocked()) {
			await this.open2FAView();
			return true;
		}

		const password = await promptForMasterPassword(this, {
			title: this.t("prompt.unlockVault.title"),
			description: this.t("prompt.unlockVault.description"),
			submitLabel: this.t("prompt.unlockVault.submit"),
		});

		if (!password) {
			return false;
		}

		try {
			await this.vaultService.unlockVault(password);
			await this.open2FAView();
			await this.refreshAllViews();
			new Notice(this.t("notice.vaultUnlocked"));
			return true;
		} catch (error) {
			this.showErrorNotice(error);
			return false;
		}
	}

	async promptToChangeMasterPassword(): Promise<boolean> {
		if (!this.isUnlocked()) {
			new Notice(this.t("notice.unlockBeforePasswordChange"));
			return false;
		}

		const nextPassword = await promptForMasterPassword(this, {
			title: this.t("prompt.changePassword.title"),
			description: this.t("prompt.changePassword.description"),
			submitLabel: this.t("prompt.changePassword.submit"),
			requireConfirmation: true,
		});

		if (!nextPassword) {
			return false;
		}

		try {
			await this.vaultService.changeMasterPassword(nextPassword);
			new Notice(this.t("notice.masterPasswordUpdated"));
			return true;
		} catch (error) {
			this.showErrorNotice(error);
			return false;
		}
	}

	async handleAddEntryCommand(): Promise<boolean> {
		await this.open2FAView();

		const isReady = await this.ensureVaultReadyForManagement();
		if (!isReady) {
			return false;
		}

		const draft = await openTotpEntryModal(this);
		if (!draft) {
			return false;
		}

		try {
			await this.vaultService.addEntry(draft);
			await this.refreshAllViews();
			new Notice(
				this.t("notice.entryAdded", {
					accountName: draft.accountName,
				}),
			);
			return true;
		} catch (error) {
			this.showErrorNotice(error);
			return false;
		}
	}

	async handleBulkImportOtpauthLinksCommand(): Promise<boolean> {
		await this.open2FAView();

		const isReady = await this.ensureVaultReadyForManagement();
		if (!isReady) {
			return false;
		}

		const modalResult = await openBulkOtpauthImportModal(this, this.getEntries());
		if (!modalResult) {
			return false;
		}

		try {
			const commitResult = await this.vaultService.commitBulkImport(
				modalResult.preview,
				modalResult.selectedDuplicateLineNumbers,
			);

			if (
				commitResult.addedEntries.length === 0 &&
				commitResult.replacedEntries.length === 0
			) {
				return false;
			}

			await this.refreshAllViews();
			new Notice(
				this.t("notice.bulkImportComplete", {
					added: commitResult.addedEntries.length,
					invalid: commitResult.invalidEntries.length,
					replaced: commitResult.replacedEntries.length,
					skipped:
						commitResult.skippedDuplicateExistingEntries.length +
						commitResult.skippedDuplicateBatchEntries.length,
				}),
			);
			return true;
		} catch (error) {
			this.showErrorNotice(error);
			return false;
		}
	}

	async promptToEditEntry(entry: TotpEntryRecord): Promise<boolean> {
		if (!this.isUnlocked()) {
			const didUnlock = await this.promptToUnlockVault();
			if (!didUnlock) {
				return false;
			}
		}

		const draft = await openTotpEntryModal(this, entry);
		if (!draft) {
			return false;
		}

		try {
			await this.vaultService.updateEntry(entry.id, draft);
			await this.refreshAllViews();
			new Notice(
				this.t("notice.entryUpdated", {
					accountName: draft.accountName,
				}),
			);
			return true;
		} catch (error) {
			this.showErrorNotice(error);
			return false;
		}
	}

	async confirmAndDeleteEntry(entry: TotpEntryRecord): Promise<boolean> {
		const confirmed = await confirmAction(this.app, {
			title: this.t("confirm.deleteEntry.title"),
			description: this.t("confirm.deleteEntry.description", {
				accountName: entry.accountName,
			}),
			confirmLabel: this.t("confirm.deleteEntry.confirmLabel"),
			cancelLabel: this.t("common.cancel"),
			warning: true,
		});

		if (!confirmed) {
			return false;
		}

		try {
			await this.vaultService.deleteEntry(entry.id);
			await this.refreshAllViews();
			new Notice(
				this.t("notice.entryDeleted", {
					accountName: entry.accountName,
				}),
			);
			return true;
		} catch (error) {
			this.showErrorNotice(error);
			return false;
		}
	}

	async confirmAndDeleteEntries(entries: readonly TotpEntryRecord[]): Promise<boolean> {
		if (entries.length === 0) {
			return false;
		}

		const confirmed = await confirmAction(this.app, {
			title: this.t("confirm.deleteEntries.title"),
			description: this.t("confirm.deleteEntries.description", {
				count: entries.length,
			}),
			confirmLabel: this.t("confirm.deleteEntries.confirmLabel"),
			cancelLabel: this.t("common.cancel"),
			warning: true,
		});

		if (!confirmed) {
			return false;
		}

		try {
			await this.vaultService.deleteEntries(entries.map((entry) => entry.id));
			await this.refreshAllViews();
			new Notice(
				this.t("notice.entriesDeleted", {
					count: entries.length,
				}),
			);
			return true;
		} catch (error) {
			this.showErrorNotice(error);
			return false;
		}
	}

	async confirmAndResetVault(): Promise<boolean> {
		const confirmed = await confirmAction(this.app, {
			title: this.t("confirm.clearVault.title"),
			description: this.t("confirm.clearVault.description"),
			confirmLabel: this.t("confirm.clearVault.confirmLabel"),
			cancelLabel: this.t("common.cancel"),
			warning: true,
		});

		if (!confirmed) {
			return false;
		}

		try {
			await this.vaultService.resetVault();
			await this.refreshAllViews();
			new Notice(this.t("notice.vaultCleared"));
			return true;
		} catch (error) {
			this.showErrorNotice(error);
			return false;
		}
	}

	async reorderEntriesByIds(nextOrderedIds: readonly string[]): Promise<void> {
		await this.vaultService.reorderEntriesByIds(nextOrderedIds);
		await this.refreshAllViews();
	}

	private async ensureVaultReadyForManagement(): Promise<boolean> {
		if (!this.isVaultInitialized()) {
			const didInitialize = await this.promptToInitializeVault();
			if (!didInitialize) {
				return false;
			}
		}

		if (!this.isUnlocked()) {
			const didUnlock = await this.promptToUnlockVault();
			if (!didUnlock) {
				return false;
			}
		}

		return true;
	}

	private showErrorNotice(error: unknown): void {
		new Notice(this.getErrorMessage(error));
	}

	private async refreshAllViews(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(OBSIDIAN_2FA_VIEW);

		await Promise.all(
			leaves.map(async (leaf) => {
				if (leaf.view instanceof TotpManagerView) {
					await leaf.view.refresh();
				}
			}),
		);
	}
}
