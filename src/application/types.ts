import type { TranslationKey } from "../i18n/translations";
import type {
	BulkOtpauthImportCommitResult,
	BulkOtpauthImportSubmission,
	PreferredSide,
	TotpEntryDraft,
	TotpEntryRecord,
	TranslationVariables,
} from "../types";
import type { BulkOtpauthImportModalResult } from "../ui/modals/bulk-otpauth-import-modal";
import type { ConfirmationOptions } from "../ui/modals/confirm-modal";
import type { MasterPasswordPromptOptions } from "../ui/modals/master-password-modal";
import type { ViewInvalidationMode } from "./contracts";

export interface TwoFactorVaultServiceLike {
	addEntry(draft: TotpEntryDraft): Promise<void>;
	changeMasterPassword(nextPassword: string): Promise<void>;
	commitBulkImport(
		submission: BulkOtpauthImportSubmission,
	): Promise<BulkOtpauthImportCommitResult>;
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

export interface TwoFactorTextApi {
	getErrorMessage(error: unknown): string;
	showNotice(message: string): void;
	t(key: TranslationKey, variables?: TranslationVariables): string;
}

export interface TwoFactorViewApi {
	open2FAView(): Promise<void>;
	refreshViews(mode: ViewInvalidationMode): Promise<void>;
}

export interface TwoFactorVaultLifecycleEnvironment
	extends TwoFactorTextApi,
		TwoFactorViewApi {
	promptForMasterPassword(options: MasterPasswordPromptOptions): Promise<string | null>;
	service: TwoFactorVaultServiceLike;
}

export interface TwoFactorEntryEnvironment extends TwoFactorTextApi, TwoFactorViewApi {
	confirmAction(options: ConfirmationOptions): Promise<boolean>;
	openBulkOtpauthImportModal(
		existingEntries: readonly TotpEntryRecord[],
		expectedVaultRevision: number,
	): Promise<BulkOtpauthImportModalResult | null>;
	openTotpEntryModal(initialDraft?: Partial<TotpEntryDraft>): Promise<TotpEntryDraft | null>;
	service: TwoFactorVaultServiceLike;
}

export interface TwoFactorPluginActionEnvironment
	extends TwoFactorVaultLifecycleEnvironment,
		TwoFactorEntryEnvironment {}
