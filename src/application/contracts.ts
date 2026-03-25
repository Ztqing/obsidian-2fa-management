import type { Plugin, WorkspaceLeaf } from "obsidian";
import type { TranslationKey } from "../i18n/translations";
import type {
	BulkOtpauthImportCommitResult,
	BulkOtpauthImportSubmission,
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
	| "floatingLock"
	| "full"
	| "search"
	| "selection";

export interface GuardedActionEnvironment {
	getErrorMessage(error: unknown): string;
	showNotice?(message: string): void;
}

export interface TranslatedNoticeEnvironment extends GuardedActionEnvironment {}

export interface CommandHandlers
	extends GuardedActionEnvironment,
		Pick<Plugin, "addCommand"> {
	handleAddEntryCommand(): Promise<unknown>;
	handleBulkImportOtpauthLinksCommand(): Promise<unknown>;
	lockVault(showNotice?: boolean): void;
	open2FAView(): Promise<WorkspaceLeaf>;
	promptToUnlockVault(): Promise<unknown>;
	t(key: TranslationKey, variables?: TranslationVariables): string;
}

export interface SettingsActions extends GuardedActionEnvironment {
	confirmAndResetVault(): Promise<boolean>;
	getPreferredSide(): PreferredSide;
	getVaultLoadIssue(): VaultLoadIssue | null;
	hasVaultLoadIssue(): boolean;
	isUnlocked(): boolean;
	isVaultInitialized(): boolean;
	lockVault(showNotice?: boolean): void;
	open2FAView(): Promise<WorkspaceLeaf>;
	promptToChangeMasterPassword(): Promise<boolean>;
	promptToInitializeVault(): Promise<boolean>;
	promptToUnlockVault(): Promise<boolean>;
	setPreferredSide(side: PreferredSide): Promise<void>;
	setShowFloatingLockButton(value: boolean): Promise<void>;
	setShowUpcomingCodes(value: boolean): Promise<void>;
	shouldShowFloatingLockButton(): boolean;
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
	getPreferredSide(): PreferredSide;
	getVaultRevision(): number;
	hasVaultLoadIssue(): boolean;
	initializeVault(password: string): Promise<void>;
	isUnlocked(): boolean;
	isVaultInitialized(): boolean;
	lockVault(): void;
	reorderEntriesByIds(nextOrderedIds: readonly string[]): Promise<void>;
	resetVault(): Promise<void>;
	setPreferredSide(side: PreferredSide): Promise<void>;
	setShowFloatingLockButton(value: boolean): Promise<void>;
	setShowUpcomingCodes(value: boolean): Promise<void>;
	shouldShowFloatingLockButton(): boolean;
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
