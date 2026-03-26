import { Notice, Plugin, getLanguage, type WorkspaceLeaf } from "obsidian";
import type {
	CommandHandlers,
	SettingsActions,
	ViewInvalidationMode,
} from "./application/contracts";
import { PreferencesService } from "./application/preferences-service";
import { registerPluginCommands } from "./commands/index";
import { OBSIDIAN_2FA_VIEW } from "./constants";
import { USER_ERROR_TRANSLATION_KEYS, isTwoFaUserError } from "./errors";
import { resolveUiLocale } from "./i18n/language";
import { type TranslationKey, translateUiString } from "./i18n/translations";
import {
	TwoFactorPluginActions,
	type TwoFactorPluginActionEnvironment,
} from "./plugin-actions";
import { TwoFactorSettingTab } from "./settings";
import { clearSharedPreparedTotpEntryCache } from "./totp/totp";
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
import type { TotpManagerViewRenderMode } from "./ui/views/totp-manager-view-renderer";
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

	private readonly preferencesService = new PreferencesService(
		this.vaultService,
		async (mode) => this.refreshAllViews(mode),
	);

	private readonly actions = new TwoFactorPluginActions(
		this.createPluginActionEnvironment(),
	);

	async onload(): Promise<void> {
		await this.vaultService.load();
		this.registerView(OBSIDIAN_2FA_VIEW, (leaf) => new TotpManagerView(leaf, this));
		this.addSettingTab(
			new TwoFactorSettingTab(this.app, this, this.createSettingsController()),
		);
		registerPluginCommands({
			...this.createCommandHandlers(),
			addCommand: this.addCommand.bind(this),
		});
	}

	onunload(): void {
		this.vaultService.lockVault();
		clearSharedPreparedTotpEntryCache();
	}

	getUiLocale(): UiLocale {
		return resolveUiLocale(getLanguage());
	}

	t(key: string, variables: TranslationVariables = {}): string {
		return translateUiString(this.getUiLocale(), key as TranslationKey, variables);
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
		return this.preferencesService.getPreferredSide();
	}

	async setPreferredSide(side: PreferredSide): Promise<void> {
		await this.preferencesService.setPreferredSide(side);
	}

	shouldShowUpcomingCodes(): boolean {
		return this.preferencesService.shouldShowUpcomingCodes();
	}

	async setShowUpcomingCodes(value: boolean): Promise<void> {
		await this.preferencesService.setShowUpcomingCodes(value);
	}

	async open2FAView(): Promise<WorkspaceLeaf> {
		const leaf = await this.app.workspace.ensureSideLeaf(
			OBSIDIAN_2FA_VIEW,
			this.preferencesService.getPreferredSide(),
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

	private createPluginActionEnvironment(): TwoFactorPluginActionEnvironment {
		return {
			confirmAction: async (options) => confirmAction(this.app, options),
			getErrorMessage: (error: unknown) => this.getErrorMessage(error),
			open2FAView: async () => {
				await this.open2FAView();
			},
			openBulkOtpauthImportModal: async (existingEntries, expectedVaultRevision) =>
				openBulkOtpauthImportModal(this, existingEntries, expectedVaultRevision),
			openTotpEntryModal: async (initialDraft) => openTotpEntryModal(this, initialDraft),
			promptForMasterPassword: async (options) => promptForMasterPassword(this, options),
			refreshAllViews: async (mode) => {
				await this.refreshAllViews(mode);
			},
			service: this.vaultService,
			showNotice: (message: string) => {
				this.showNotice(message);
			},
			t: (key, variables = {}) => this.t(key, variables),
		};
	}

	private createCommandHandlers(): CommandHandlers {
		return {
			getErrorMessage: (error: unknown) => this.getErrorMessage(error),
			handleAddEntryCommand: async () => this.handleAddEntryCommand(),
			handleBulkImportOtpauthLinksCommand: async () =>
				this.handleBulkImportOtpauthLinksCommand(),
			lockVault: (showNotice = false) => {
				this.lockVault(showNotice);
			},
			open2FAView: async () => this.open2FAView(),
			promptToUnlockVault: async () => this.promptToUnlockVault(),
			showNotice: (message: string) => {
				this.showNotice(message);
			},
			t: (key, variables = {}) => this.t(key, variables),
		};
	}

	private createSettingsController(): SettingsActions {
		return {
			confirmAndResetVault: async () => this.confirmAndResetVault(),
			getErrorMessage: (error: unknown) => this.getErrorMessage(error),
			getPreferredSide: () => this.getPreferredSide(),
			getVaultLoadIssue: () => this.getVaultLoadIssue(),
			hasVaultLoadIssue: () => this.hasVaultLoadIssue(),
			isUnlocked: () => this.isUnlocked(),
			isVaultInitialized: () => this.isVaultInitialized(),
			lockVault: (showNotice = false) => {
				this.lockVault(showNotice);
			},
			open2FAView: async () => this.open2FAView(),
			promptToChangeMasterPassword: async () => this.promptToChangeMasterPassword(),
			promptToInitializeVault: async () => this.promptToInitializeVault(),
			promptToUnlockVault: async () => this.promptToUnlockVault(),
			setPreferredSide: async (side: PreferredSide) => this.setPreferredSide(side),
			setShowUpcomingCodes: async (value: boolean) =>
				this.setShowUpcomingCodes(value),
			shouldShowUpcomingCodes: () => this.shouldShowUpcomingCodes(),
			showNotice: (message: string) => {
				this.showNotice(message);
			},
			t: (key: TranslationKey, variables = {}) => this.t(key, variables),
		};
	}

	private async refreshAllViews(mode: ViewInvalidationMode = "full"): Promise<void> {
		const renderMode = this.toViewRenderMode(mode);
		const leaves = this.app.workspace.getLeavesOfType(OBSIDIAN_2FA_VIEW);
		await Promise.allSettled(
			leaves.map(async (leaf) => {
				if (leaf.view instanceof TotpManagerView) {
					await leaf.view.refresh(renderMode);
				}
			}),
		);
	}

	private toViewRenderMode(mode: ViewInvalidationMode): TotpManagerViewRenderMode {
		switch (mode) {
			case "availability":
				return "availability";
			case "entries":
				return "entries";
			case "search":
				return "search";
			case "selection":
				return "body";
			case "full":
			default:
				return "full";
		}
	}
}
