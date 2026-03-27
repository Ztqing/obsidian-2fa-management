import type { WorkspaceLeaf } from "obsidian";
import type { TranslationKey } from "../i18n/translations";
import type {
	BulkOtpauthImportCommitResult,
	BulkOtpauthImportSubmission,
	LockTimeoutMode,
	PersistedUnlockCapability,
	PreferredSide,
	TotpEntryDraft,
	TotpEntryRecord,
	TranslationVariables,
	VaultLoadIssue,
} from "../types";
import type { BulkOtpauthImportModalResult } from "../ui/modals/bulk-otpauth-import-modal";
import type { ConfirmationOptions } from "../ui/modals/confirm-modal";
import type { MasterPasswordPromptOptions } from "../ui/modals/master-password-modal";

export type ViewInvalidationMode =
	| "availability"
	| "entries"
	| "full"
	| "search"
	| "selection";

export interface GuardedActionEnvironment {
	getErrorMessage(error: unknown): string;
	showNotice?(message: string): void;
}

export interface CommandHandlers extends GuardedActionEnvironment {
	handleAddEntryCommand(): Promise<unknown>;
	handleBulkImportOtpauthLinksCommand(): Promise<unknown>;
	lockVault(showNotice?: boolean): void;
	open2FAView(): Promise<WorkspaceLeaf>;
	promptToUnlockVault(): Promise<unknown>;
	recordSessionActivity(): void;
	t(key: TranslationKey, variables?: TranslationVariables): string;
}

export interface SettingsActions extends GuardedActionEnvironment {
	confirmEnableInsecurePersistedUnlockFallback(): Promise<boolean>;
	confirmAndResetVault(): Promise<boolean>;
	getPersistedUnlockCapability(): PersistedUnlockCapability;
	getLockTimeoutMinutes(): number;
	getLockTimeoutMode(): LockTimeoutMode;
	getPreferredSide(): PreferredSide;
	getVaultLoadIssue(): VaultLoadIssue | null;
	hasVaultLoadIssue(): boolean;
	isInsecurePersistedUnlockFallbackEnabled(): boolean;
	isUnlocked(): boolean;
	isVaultInitialized(): boolean;
	lockVault(showNotice?: boolean): void;
	open2FAView(): Promise<WorkspaceLeaf>;
	promptToChangeMasterPassword(): Promise<boolean>;
	promptToInitializeVault(): Promise<boolean>;
	promptToUnlockVault(): Promise<boolean>;
	recordSessionActivity(): void;
	setInsecurePersistedUnlockFallbackEnabled(enabled: boolean): Promise<void>;
	setLockTimeoutMinutes(minutes: number): Promise<void>;
	setLockTimeoutMode(mode: LockTimeoutMode): Promise<void>;
	setPreferredSide(side: PreferredSide): Promise<void>;
	setShowUpcomingCodes(value: boolean): Promise<void>;
	shouldShowUpcomingCodes(): boolean;
	t(key: TranslationKey, variables?: TranslationVariables): string;
}

export interface TwoFactorVaultServiceLike {
	addEntry(draft: TotpEntryDraft): Promise<void>;
	changeMasterPassword(nextPassword: string): Promise<void>;
	commitBulkImport(submission: BulkOtpauthImportSubmission): Promise<BulkOtpauthImportCommitResult>;
	deleteEntries(entryIds: readonly string[]): Promise<void>;
	deleteEntry(entryId: string): Promise<void>;
	getEntries(): TotpEntryRecord[];
	getPersistedUnlockCapability(): PersistedUnlockCapability;
	getLockTimeoutMinutes(): number;
	getLockTimeoutMode(): LockTimeoutMode;
	getPreferredSide(): PreferredSide;
	getVaultRevision(): number;
	hasVaultLoadIssue(): boolean;
	initializeVault(password: string): Promise<void>;
	isInsecurePersistedUnlockFallbackEnabled(): boolean;
	isUnlocked(): boolean;
	isVaultInitialized(): boolean;
	lockVault(): void;
	reorderEntriesByIds(nextOrderedIds: readonly string[]): Promise<void>;
	resetVault(): Promise<void>;
	setInsecurePersistedUnlockFallbackEnabled(enabled: boolean): Promise<void>;
	setLockTimeoutMinutes(minutes: number): Promise<void>;
	setLockTimeoutMode(mode: LockTimeoutMode): Promise<void>;
	setPreferredSide(side: PreferredSide): Promise<void>;
	setShowUpcomingCodes(value: boolean): Promise<void>;
	shouldShowUpcomingCodes(): boolean;
	unlockVault(password: string): Promise<void>;
	updateEntry(
		entryId: string,
		draft: TotpEntryDraft,
		expectedVaultRevision: number,
	): Promise<void>;
}

export interface TwoFactorPluginActionEnvironment extends GuardedActionEnvironment {
	confirmAction(options: ConfirmationOptions): Promise<boolean>;
	open2FAView(): Promise<void>;
	openBulkOtpauthImportModal(
		existingEntries: readonly TotpEntryRecord[],
		expectedVaultRevision: number,
	): Promise<BulkOtpauthImportModalResult | null>;
	openTotpEntryModal(initialDraft?: Partial<TotpEntryDraft>): Promise<TotpEntryDraft | null>;
	promptForMasterPassword(options: MasterPasswordPromptOptions): Promise<string | null>;
	refreshAllViews(mode?: ViewInvalidationMode): Promise<void>;
	service: TwoFactorVaultServiceLike;
	t(key: TranslationKey, variables?: TranslationVariables): string;
}
