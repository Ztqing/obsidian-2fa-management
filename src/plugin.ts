import { Notice, Plugin, getLanguage, type WorkspaceLeaf } from "obsidian";
import { registerPluginCommands } from "./commands";
import { OBSIDIAN_2FA_VIEW } from "./constants";
import { USER_ERROR_TRANSLATION_KEYS, isTwoFaUserError } from "./errors";
import { resolveUiLocale } from "./i18n/language";
import { type TranslationKey, translateUiString } from "./i18n/translations";
import { TwoFactorPluginActions } from "./plugin-actions";
import { TwoFactorSettingTab } from "./settings";
import type {
	PreferredSide,
	TotpEntryRecord,
	TranslationVariables,
	UiLocale,
	VaultLoadIssue,
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
	private readonly actions = new TwoFactorPluginActions({
		confirmAction: async (options) => confirmAction(this.app, options),
		getErrorMessage: (error) => this.getErrorMessage(error),
		open2FAView: async () => {
			await this.open2FAView();
		},
		openBulkOtpauthImportModal: async (existingEntries, expectedVaultRevision) =>
			openBulkOtpauthImportModal(this, existingEntries, expectedVaultRevision),
		openTotpEntryModal: async (initialDraft) => openTotpEntryModal(this, initialDraft),
		promptForMasterPassword: async (options) => promptForMasterPassword(this, options),
		refreshAllViews: async () => {
			await this.refreshAllViews();
		},
		service: this.vaultService,
		showNotice: (message) => {
			this.showNotice(message);
		},
		t: (key, variables = {}) => this.t(key, variables),
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

	showNotice(message: string): void {
		new Notice(message);
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

	hasVaultLoadIssue(): boolean {
		return this.vaultService.hasVaultLoadIssue();
	}

	getVaultLoadIssue(): VaultLoadIssue | null {
		return this.vaultService.getVaultLoadIssue();
	}

	isUnlocked(): boolean {
		return this.vaultService.isUnlocked();
	}

	getEntries(): TotpEntryRecord[] {
		return this.vaultService.getEntries();
	}

	getVaultRevision(): number {
		return this.vaultService.getVaultRevision();
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

	shouldShowFloatingLockButton(): boolean {
		return this.vaultService.shouldShowFloatingLockButton();
	}

	async setShowFloatingLockButton(value: boolean): Promise<void> {
		await this.vaultService.setShowFloatingLockButton(value);
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
		this.actions.lockVault(showNotice);
	}

	async promptToInitializeVault(): Promise<boolean> {
		return this.actions.promptToInitializeVault();
	}

	async promptToUnlockVault(): Promise<boolean> {
		return this.actions.promptToUnlockVault();
	}

	async promptToChangeMasterPassword(): Promise<boolean> {
		return this.actions.promptToChangeMasterPassword();
	}

	async handleAddEntryCommand(): Promise<boolean> {
		return this.actions.handleAddEntryCommand();
	}

	async handleBulkImportOtpauthLinksCommand(): Promise<boolean> {
		return this.actions.handleBulkImportOtpauthLinksCommand();
	}

	async promptToEditEntry(entry: TotpEntryRecord): Promise<boolean> {
		return this.actions.promptToEditEntry(entry);
	}

	async confirmAndDeleteEntry(entry: TotpEntryRecord): Promise<boolean> {
		return this.actions.confirmAndDeleteEntry(entry);
	}

	async confirmAndDeleteEntries(entries: readonly TotpEntryRecord[]): Promise<boolean> {
		return this.actions.confirmAndDeleteEntries(entries);
	}

	async confirmAndResetVault(): Promise<boolean> {
		return this.actions.confirmAndResetVault();
	}

	async reorderEntriesByIds(nextOrderedIds: readonly string[]): Promise<void> {
		await this.actions.reorderEntriesByIds(nextOrderedIds);
	}

	private async refreshAllViews(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(OBSIDIAN_2FA_VIEW);
		await Promise.allSettled(
			leaves.map(async (leaf) => {
				if (leaf.view instanceof TotpManagerView) {
					await leaf.view.refresh();
				}
			}),
		);
	}
}
