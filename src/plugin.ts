import { Notice, Plugin, getLanguage, type WorkspaceLeaf } from "obsidian";
import { DEFAULT_PLUGIN_DATA, OBSIDIAN_2FA_VIEW } from "./constants";
import {
	getNextTotpSortOrder,
	normalizePluginData,
	normalizeTotpEntryDraft,
	reindexTotpEntries,
	sortTotpEntries,
} from "./data/store";
import { USER_ERROR_TRANSLATION_KEYS, createUserError, isTwoFaUserError } from "./errors";
import { applyBulkOtpauthImportPreview } from "./import/bulk-otpauth";
import { resolveUiLocale } from "./i18n/language";
import { type TranslationKey, translateUiString } from "./i18n/translations";
import { TwoFactorSettingTab } from "./settings";
import { decryptVaultEntries, encryptVaultEntries } from "./security/crypto";
import type {
	PluginData,
	PreferredSide,
	TotpEntryDraft,
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

export default class TwoFactorManagementPlugin extends Plugin {
	private pluginData: PluginData = DEFAULT_PLUGIN_DATA;
	private unlockedEntries: TotpEntryRecord[] | null = null;
	private sessionPassword: string | null = null;

	async onload(): Promise<void> {
		await this.loadPluginData();
		this.registerView(OBSIDIAN_2FA_VIEW, (leaf) => new TotpManagerView(leaf, this));
		this.addSettingTab(new TwoFactorSettingTab(this.app, this));
		this.registerCommands();
	}

	onunload(): void {
		this.clearUnlockedState();
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
		return this.pluginData.vault !== null;
	}

	isUnlocked(): boolean {
		return this.unlockedEntries !== null;
	}

	getEntries(): TotpEntryRecord[] {
		return this.unlockedEntries ? [...this.unlockedEntries] : [];
	}

	getPreferredSide(): PreferredSide {
		return this.pluginData.settings.preferredSide;
	}

	async setPreferredSide(side: PreferredSide): Promise<void> {
		this.pluginData.settings.preferredSide = side;
		await this.persistPluginData();
	}

	shouldShowUpcomingCodes(): boolean {
		return this.pluginData.settings.showUpcomingCodes;
	}

	async setShowUpcomingCodes(value: boolean): Promise<void> {
		this.pluginData.settings.showUpcomingCodes = value;
		await this.persistPluginData();
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
		this.clearUnlockedState();
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

		await this.initializeVault(password);
		await this.open2FAView();
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
			this.unlockedEntries = await decryptVaultEntries(this.pluginData.vault!, password);
			this.sessionPassword = password;
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
			await this.reencryptUnlockedEntries(nextPassword);
			this.sessionPassword = nextPassword;
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
			await this.addEntry(draft);
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

		const existingEntries = this.requireUnlockedEntries();
		const modalResult = await openBulkOtpauthImportModal(this, existingEntries);
		if (!modalResult) {
			return false;
		}

		try {
			const commitResult = applyBulkOtpauthImportPreview(modalResult.preview, {
				existingEntries,
				selectedDuplicateLineNumbers: modalResult.selectedDuplicateLineNumbers,
				createId: () => createRandomId(),
			});

			if (
				commitResult.addedEntries.length === 0 &&
				commitResult.replacedEntries.length === 0
			) {
				return false;
			}

			await this.replaceUnlockedEntries(commitResult.nextEntries);
			new Notice(
				this.t("notice.bulkImportComplete", {
					added: commitResult.addedEntries.length,
					replaced: commitResult.replacedEntries.length,
					skipped:
						commitResult.skippedDuplicateExistingEntries.length +
						commitResult.skippedDuplicateBatchEntries.length,
					invalid: commitResult.invalidEntries.length,
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
			await this.updateEntry(entry.id, draft);
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
			await this.deleteEntry(entry.id);
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
			await this.deleteEntries(entries.map((entry) => entry.id));
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
			this.pluginData.vault = null;
			this.clearUnlockedState();
			await this.persistPluginData();
			await this.refreshAllViews();
			new Notice(this.t("notice.vaultCleared"));
			return true;
		} catch (error) {
			this.showErrorNotice(error);
			return false;
		}
	}

	private registerCommands(): void {
		this.addCommand({
			id: "open-2fa-view",
			name: this.t("command.openView"),
			callback: () => {
				void this.open2FAView();
			},
		});

		this.addCommand({
			id: "unlock-2fa-vault",
			name: this.t("command.unlockVault"),
			callback: () => {
				void this.promptToUnlockVault();
			},
		});

		this.addCommand({
			id: "lock-2fa-vault",
			name: this.t("command.lockVault"),
			callback: () => {
				this.lockVault(true);
			},
		});

		this.addCommand({
			id: "add-totp-entry",
			name: this.t("command.addEntry"),
			callback: () => {
				void this.handleAddEntryCommand();
			},
		});

		this.addCommand({
			id: "bulk-import-otpauth-links",
			name: this.t("command.bulkImportOtpauthLinks"),
			callback: () => {
				void this.handleBulkImportOtpauthLinksCommand();
			},
		});
	}

	private async loadPluginData(): Promise<void> {
		this.pluginData = normalizePluginData(await this.loadData());
	}

	private async persistPluginData(): Promise<void> {
		await this.saveData(this.pluginData);
	}

	private async initializeVault(password: string): Promise<void> {
		this.unlockedEntries = [];
		this.sessionPassword = password;
		this.pluginData.vault = await encryptVaultEntries([], password);
		await this.persistPluginData();
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

	private requireUnlockedEntries(): TotpEntryRecord[] {
		if (!this.unlockedEntries || !this.sessionPassword) {
			throw createUserError("vault_unlock_required");
		}

		return this.unlockedEntries;
	}

	private async addEntry(draft: TotpEntryDraft): Promise<void> {
		const normalizedDraft = normalizeTotpEntryDraft(draft);
		const existingEntries = sortTotpEntries(this.requireUnlockedEntries());
		const nextEntries = [
			...existingEntries,
			{
				id: createRandomId(),
				sortOrder: getNextTotpSortOrder(existingEntries),
				...normalizedDraft,
			},
		];
		await this.replaceUnlockedEntries(nextEntries);
	}

	private async updateEntry(entryId: string, draft: TotpEntryDraft): Promise<void> {
		const normalizedDraft = normalizeTotpEntryDraft(draft);
		const nextEntries = this.requireUnlockedEntries().map((entry) => {
			if (entry.id !== entryId) {
				return entry;
			}

			return {
				id: entry.id,
				sortOrder: entry.sortOrder,
				...normalizedDraft,
			};
		});
		await this.replaceUnlockedEntries(nextEntries);
	}

	private async deleteEntry(entryId: string): Promise<void> {
		const nextEntries = this.requireUnlockedEntries().filter((entry) => entry.id !== entryId);
		await this.replaceUnlockedEntries(nextEntries);
	}

	private async deleteEntries(entryIds: readonly string[]): Promise<void> {
		const idsToDelete = new Set(entryIds);
		const nextEntries = this.requireUnlockedEntries().filter((entry) => !idsToDelete.has(entry.id));
		await this.replaceUnlockedEntries(nextEntries);
	}

	async reorderEntriesByIds(nextOrderedIds: readonly string[]): Promise<void> {
		const currentEntries = sortTotpEntries(this.requireUnlockedEntries());
		const entriesById = new Map(currentEntries.map((entry) => [entry.id, entry] as const));
		const seenIds = new Set<string>();
		const nextEntries: TotpEntryRecord[] = [];

		for (const entryId of nextOrderedIds) {
			const entry = entriesById.get(entryId);

			if (!entry || seenIds.has(entryId)) {
				continue;
			}

			nextEntries.push(entry);
			seenIds.add(entryId);
		}

		for (const entry of currentEntries) {
			if (seenIds.has(entry.id)) {
				continue;
			}

			nextEntries.push(entry);
		}

		await this.replaceUnlockedEntries(nextEntries);
	}

	private async replaceUnlockedEntries(entries: TotpEntryRecord[]): Promise<void> {
		this.unlockedEntries = reindexTotpEntries(entries);
		await this.reencryptUnlockedEntries(this.sessionPassword);
		await this.refreshAllViews();
	}

	private async reencryptUnlockedEntries(password: string | null): Promise<void> {
		if (!password) {
			throw createUserError("vault_unlock_required");
		}

		this.pluginData.vault = await encryptVaultEntries(this.requireUnlockedEntries(), password);
		await this.persistPluginData();
	}

	private clearUnlockedState(): void {
		this.unlockedEntries = null;
		this.sessionPassword = null;
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
