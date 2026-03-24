import type { TranslationKey } from "./i18n/translations";
import { MIN_MASTER_PASSWORD_LENGTH } from "./security/master-password";
import type {
	BulkOtpauthImportCommitResult,
	BulkOtpauthImportSubmission,
	TotpEntryDraft,
	TotpEntryRecord,
	TranslationVariables,
} from "./types";
import type { BulkOtpauthImportModalResult } from "./ui/modals/bulk-otpauth-import-modal";
import type { ConfirmationOptions } from "./ui/modals/confirm-modal";
import type { MasterPasswordPromptOptions } from "./ui/modals/master-password-modal";

export interface TwoFactorVaultServiceLike {
	addEntry(draft: TotpEntryDraft): Promise<void>;
	changeMasterPassword(nextPassword: string): Promise<void>;
	commitBulkImport(submission: BulkOtpauthImportSubmission): Promise<BulkOtpauthImportCommitResult>;
	deleteEntries(entryIds: readonly string[]): Promise<void>;
	deleteEntry(entryId: string): Promise<void>;
	getEntries(): TotpEntryRecord[];
	getPreferredSide(): "left" | "right";
	getVaultRevision(): number;
	hasVaultLoadIssue(): boolean;
	initializeVault(password: string): Promise<void>;
	isUnlocked(): boolean;
	isVaultInitialized(): boolean;
	lockVault(): void;
	reorderEntriesByIds(nextOrderedIds: readonly string[]): Promise<void>;
	resetVault(): Promise<void>;
	setPreferredSide(side: "left" | "right"): Promise<void>;
	setShowUpcomingCodes(value: boolean): Promise<void>;
	shouldShowUpcomingCodes(): boolean;
	unlockVault(password: string): Promise<void>;
	updateEntry(
		entryId: string,
		draft: TotpEntryDraft,
		expectedVaultRevision: number,
	): Promise<void>;
}

export interface TwoFactorPluginActionEnvironment {
	confirmAction(options: ConfirmationOptions): Promise<boolean>;
	getErrorMessage(error: unknown): string;
	open2FAView(): Promise<void>;
	openBulkOtpauthImportModal(
		existingEntries: readonly TotpEntryRecord[],
		expectedVaultRevision: number,
	): Promise<BulkOtpauthImportModalResult | null>;
	openTotpEntryModal(initialDraft?: Partial<TotpEntryDraft>): Promise<TotpEntryDraft | null>;
	promptForMasterPassword(options: MasterPasswordPromptOptions): Promise<string | null>;
	refreshAllViews(): Promise<void>;
	service: TwoFactorVaultServiceLike;
	showNotice(message: string): void;
	t(key: TranslationKey, variables?: TranslationVariables): string;
}

export class TwoFactorPluginActions {
	constructor(private readonly environment: TwoFactorPluginActionEnvironment) {}

	lockVault(showNotice = false): void {
		this.environment.service.lockVault();
		if (showNotice) {
			this.environment.showNotice(this.environment.t("notice.vaultLocked"));
		}
		void this.environment.refreshAllViews();
	}

	async promptToInitializeVault(): Promise<boolean> {
		if (this.ensureVaultRepairNotRequired()) {
			return false;
		}

		if (this.environment.service.isVaultInitialized()) {
			this.environment.showNotice(this.environment.t("notice.vaultExists"));
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
		await this.environment.open2FAView();
		await this.environment.refreshAllViews();
		this.environment.showNotice(this.environment.t("notice.vaultCreated"));
		return true;
	}

	async promptToUnlockVault(): Promise<boolean> {
		if (this.ensureVaultRepairNotRequired()) {
			return false;
		}

		if (!this.environment.service.isVaultInitialized()) {
			this.environment.showNotice(this.environment.t("notice.vaultCreateFirst"));
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
			await this.environment.refreshAllViews();
			this.environment.showNotice(this.environment.t("notice.vaultUnlocked"));
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
			this.environment.showNotice(
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
			this.environment.showNotice(this.environment.t("notice.masterPasswordUpdated"));
			return true;
		} catch (error) {
			this.showErrorNotice(error);
			return false;
		}
	}

	async handleAddEntryCommand(): Promise<boolean> {
		await this.environment.open2FAView();

		const isReady = await this.ensureVaultReadyForManagement();
		if (!isReady) {
			return false;
		}

		const draft = await this.environment.openTotpEntryModal();
		if (!draft) {
			return false;
		}

		try {
			await this.environment.service.addEntry(draft);
			await this.environment.refreshAllViews();
			this.environment.showNotice(
				this.environment.t("notice.entryAdded", {
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
		await this.environment.open2FAView();

		const isReady = await this.ensureVaultReadyForManagement();
		if (!isReady) {
			return false;
		}

		const modalResult = await this.environment.openBulkOtpauthImportModal(
			this.environment.service.getEntries(),
			this.environment.service.getVaultRevision(),
		);
		if (!modalResult) {
			return false;
		}

		try {
			const commitResult = await this.environment.service.commitBulkImport(modalResult);

			if (
				commitResult.addedEntries.length === 0 &&
				commitResult.replacedEntries.length === 0
			) {
				return false;
			}

			await this.environment.refreshAllViews();
			this.environment.showNotice(
				this.environment.t("notice.bulkImportComplete", {
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
		if (!this.environment.service.isUnlocked()) {
			const didUnlock = await this.promptToUnlockVault();
			if (!didUnlock) {
				return false;
			}
		}

		const expectedVaultRevision = this.environment.service.getVaultRevision();
		const draft = await this.environment.openTotpEntryModal(entry);
		if (!draft) {
			return false;
		}

		try {
			await this.environment.service.updateEntry(
				entry.id,
				draft,
				expectedVaultRevision,
			);
			await this.environment.refreshAllViews();
			this.environment.showNotice(
				this.environment.t("notice.entryUpdated", {
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
		const confirmed = await this.environment.confirmAction({
			title: this.environment.t("confirm.deleteEntry.title"),
			description: this.environment.t("confirm.deleteEntry.description", {
				accountName: entry.accountName,
			}),
			confirmLabel: this.environment.t("confirm.deleteEntry.confirmLabel"),
			cancelLabel: this.environment.t("common.cancel"),
			warning: true,
		});

		if (!confirmed) {
			return false;
		}

		try {
			await this.environment.service.deleteEntry(entry.id);
			await this.environment.refreshAllViews();
			this.environment.showNotice(
				this.environment.t("notice.entryDeleted", {
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

		const confirmed = await this.environment.confirmAction({
			title: this.environment.t("confirm.deleteEntries.title"),
			description: this.environment.t("confirm.deleteEntries.description", {
				count: entries.length,
			}),
			confirmLabel: this.environment.t("confirm.deleteEntries.confirmLabel"),
			cancelLabel: this.environment.t("common.cancel"),
			warning: true,
		});

		if (!confirmed) {
			return false;
		}

		try {
			await this.environment.service.deleteEntries(entries.map((entry) => entry.id));
			await this.environment.refreshAllViews();
			this.environment.showNotice(
				this.environment.t("notice.entriesDeleted", {
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
			await this.environment.refreshAllViews();
			this.environment.showNotice(this.environment.t("notice.vaultCleared"));
			return true;
		} catch (error) {
			this.showErrorNotice(error);
			return false;
		}
	}

	async reorderEntriesByIds(nextOrderedIds: readonly string[]): Promise<void> {
		await this.environment.service.reorderEntriesByIds(nextOrderedIds);
		await this.environment.refreshAllViews();
	}

	private async ensureVaultReadyForManagement(): Promise<boolean> {
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

		this.environment.showNotice(this.environment.t("notice.vaultRepairRequired"));
		return true;
	}

	private showErrorNotice(error: unknown): void {
		this.environment.showNotice(this.environment.getErrorMessage(error));
	}
}
