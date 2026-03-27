import { Notice, Plugin, getLanguage, type WorkspaceLeaf } from "obsidian";
import type { ViewInvalidationMode } from "./application/contracts";
import {
	confirmEnableInsecurePersistedUnlockFallback,
	createCommandHandlers,
	createPluginActionEnvironment,
	createSettingsController,
} from "./plugin/internal/controllers";
import { refreshManagedViews } from "./plugin/internal/view-refresh";
import { PreferencesService } from "./application/preferences-service";
import { SessionLockController } from "./application/session-lock-controller";
import { registerPluginCommands } from "./commands/index";
import { OBSIDIAN_2FA_VIEW } from "./constants";
import { USER_ERROR_TRANSLATION_KEYS, isTwoFaUserError } from "./errors";
import { resolveUiLocale } from "./i18n/language";
import { type TranslationKey, translateUiString } from "./i18n/translations";
import {
	TwoFactorPluginActions,
} from "./plugin-actions";
import { TwoFactorSettingTab } from "./settings";
import { clearSharedPreparedTotpEntryCache } from "./totp/totp";
import type {
	LockTimeoutMode,
	PersistedUnlockCapability,
	PreferredSide,
	TotpEntryRecord,
	TranslationVariables,
	UiLocale,
	VaultLoadIssue,
} from "./types";
import { createRandomId } from "./utils/id";
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

	private readonly preferencesService = new PreferencesService(
		this.vaultService,
		async (mode) => this.refreshAllViews(mode),
	);

	private readonly actions = new TwoFactorPluginActions(
		createPluginActionEnvironment(this, {
			refreshAllViews: async (mode) => this.refreshAllViews(mode),
			service: this.vaultService,
		}),
	);

	private readonly sessionLockController = new SessionLockController({
		getLockTimeoutMinutes: () => this.vaultService.getLockTimeoutMinutes(),
		getLockTimeoutMode: () => this.vaultService.getLockTimeoutMode(),
		isUnlocked: () => this.vaultService.isUnlocked(),
		lockVaultDueToTimeout: () => {
			this.lockVaultDueToTimeout();
		},
	});

	async onload(): Promise<void> {
		await this.vaultService.load();
		this.sessionLockController.syncState();
		this.registerView(OBSIDIAN_2FA_VIEW, (leaf) => new TotpManagerView(leaf, this));
		this.addSettingTab(
			new TwoFactorSettingTab(
				this.app,
				this,
				createSettingsController(
					this,
					() => this.confirmEnableInsecurePersistedUnlockFallback(),
				),
			),
		);
		registerPluginCommands({
			...createCommandHandlers(this),
			addCommand: this.addCommand.bind(this),
		});
	}

	onunload(): void {
		this.sessionLockController.destroy();
		this.vaultService.clearSession();
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

	getLockTimeoutMode(): LockTimeoutMode {
		return this.vaultService.getLockTimeoutMode();
	}

	getLockTimeoutMinutes(): number {
		return this.vaultService.getLockTimeoutMinutes();
	}

	getPersistedUnlockCapability(): PersistedUnlockCapability {
		return this.vaultService.getPersistedUnlockCapability();
	}

	isInsecurePersistedUnlockFallbackEnabled(): boolean {
		return this.vaultService.isInsecurePersistedUnlockFallbackEnabled();
	}

	async setPreferredSide(side: PreferredSide): Promise<void> {
		await this.preferencesService.setPreferredSide(side);
	}

	async setLockTimeoutMode(mode: LockTimeoutMode): Promise<void> {
		await this.vaultService.setLockTimeoutMode(mode);
		this.sessionLockController.syncState();
	}

	async setLockTimeoutMinutes(minutes: number): Promise<void> {
		await this.vaultService.setLockTimeoutMinutes(minutes);
		this.sessionLockController.syncState();
	}

	async setInsecurePersistedUnlockFallbackEnabled(
		enabled: boolean,
	): Promise<void> {
		await this.vaultService.setInsecurePersistedUnlockFallbackEnabled(enabled);
		this.sessionLockController.syncState();
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
		this.sessionLockController.syncState();
	}

	lockVaultDueToTimeout(): void {
		this.actions.lockVaultDueToTimeout();
		this.sessionLockController.syncState();
	}

	async promptToInitializeVault(): Promise<boolean> {
		const didInitialize = await this.actions.promptToInitializeVault();
		if (didInitialize) {
			this.sessionLockController.syncState();
		}
		return didInitialize;
	}

	async promptToUnlockVault(): Promise<boolean> {
		const didUnlock = await this.actions.promptToUnlockVault();
		if (didUnlock) {
			this.sessionLockController.syncState();
		}
		return didUnlock;
	}

	async promptToChangeMasterPassword(): Promise<boolean> {
		const didChange = await this.actions.promptToChangeMasterPassword();
		if (didChange) {
			this.sessionLockController.syncState();
		}
		return didChange;
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
		const didReset = await this.actions.confirmAndResetVault();
		if (didReset) {
			this.sessionLockController.syncState();
		}
		return didReset;
	}

	async reorderEntriesByIds(nextOrderedIds: readonly string[]): Promise<void> {
		await this.actions.reorderEntriesByIds(nextOrderedIds);
	}

	recordSessionActivity(): void {
		this.sessionLockController.noteActivity();
	}

	private async confirmEnableInsecurePersistedUnlockFallback(): Promise<boolean> {
		return confirmEnableInsecurePersistedUnlockFallback(
			this,
		);
	}

	private async refreshAllViews(mode: ViewInvalidationMode = "full"): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(OBSIDIAN_2FA_VIEW);
		await refreshManagedViews(
			leaves,
			mode,
			(view): view is TotpManagerView => view instanceof TotpManagerView,
		);
	}
}
