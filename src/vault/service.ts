import { DEFAULT_PLUGIN_DATA } from "../constants";
import {
	getNextTotpSortOrder,
	normalizePluginData,
	normalizeTotpEntryDraft,
	reindexTotpEntries,
	sortTotpEntries,
} from "../data/store";
import { createUserError } from "../errors";
import { applyBulkOtpauthImportPreview } from "../import/bulk-otpauth";
import { decryptVaultEntries, encryptVaultEntries } from "../security/crypto";
import type {
	BulkOtpauthImportCommitResult,
	BulkOtpauthImportPreview,
	PluginData,
	PreferredSide,
	TotpEntryDraft,
	TotpEntryRecord,
} from "../types";

export interface TwoFactorVaultServiceDependencies {
	createId: () => string;
	loadData: () => Promise<unknown>;
	saveData: (data: PluginData) => Promise<void>;
}

export class TwoFactorVaultService {
	private pluginData: PluginData = DEFAULT_PLUGIN_DATA;
	private unlockedEntries: TotpEntryRecord[] | null = null;
	private sessionPassword: string | null = null;

	constructor(private readonly dependencies: TwoFactorVaultServiceDependencies) {}

	async load(): Promise<void> {
		this.pluginData = normalizePluginData(await this.dependencies.loadData());
		this.clearUnlockedState();
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
	}

	shouldShowFloatingLockButton(): boolean {
		return this.pluginData.settings.showFloatingLockButton;
	}

	async setShowFloatingLockButton(value: boolean): Promise<void> {
		this.pluginData.settings.showFloatingLockButton = value;
		await this.persistPluginData();
	}

	async initializeVault(password: string): Promise<void> {
		this.unlockedEntries = [];
		this.sessionPassword = password;
		this.pluginData.vault = await encryptVaultEntries([], password);
		await this.persistPluginData();
	}

	async unlockVault(password: string): Promise<void> {
		if (!this.pluginData.vault) {
			throw createUserError("vault_unlock_required");
		}

		this.unlockedEntries = await decryptVaultEntries(this.pluginData.vault, password);
		this.sessionPassword = password;
	}

	lockVault(): void {
		this.clearUnlockedState();
	}

	async changeMasterPassword(nextPassword: string): Promise<void> {
		await this.reencryptUnlockedEntries(nextPassword);
		this.sessionPassword = nextPassword;
	}

	async addEntry(draft: TotpEntryDraft): Promise<void> {
		const normalizedDraft = normalizeTotpEntryDraft(draft);
		const existingEntries = sortTotpEntries(this.requireUnlockedEntries());
		const nextEntries = [
			...existingEntries,
			{
				id: this.dependencies.createId(),
				sortOrder: getNextTotpSortOrder(existingEntries),
				...normalizedDraft,
			},
		];
		await this.replaceUnlockedEntries(nextEntries);
	}

	async updateEntry(entryId: string, draft: TotpEntryDraft): Promise<void> {
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

	async deleteEntry(entryId: string): Promise<void> {
		const nextEntries = this.requireUnlockedEntries().filter((entry) => entry.id !== entryId);
		await this.replaceUnlockedEntries(nextEntries);
	}

	async deleteEntries(entryIds: readonly string[]): Promise<void> {
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

	async commitBulkImport(
		preview: BulkOtpauthImportPreview,
		selectedDuplicateLineNumbers: readonly number[],
	): Promise<BulkOtpauthImportCommitResult> {
		const commitResult = applyBulkOtpauthImportPreview(preview, {
			existingEntries: this.requireUnlockedEntries(),
			selectedDuplicateLineNumbers: [...selectedDuplicateLineNumbers],
			createId: () => this.dependencies.createId(),
		});

		if (
			commitResult.addedEntries.length === 0 &&
			commitResult.replacedEntries.length === 0
		) {
			return commitResult;
		}

		await this.replaceUnlockedEntries(commitResult.nextEntries);
		return commitResult;
	}

	async resetVault(): Promise<void> {
		this.pluginData.vault = null;
		this.clearUnlockedState();
		await this.persistPluginData();
	}

	private requireUnlockedEntries(): TotpEntryRecord[] {
		if (!this.unlockedEntries || !this.sessionPassword) {
			throw createUserError("vault_unlock_required");
		}

		return this.unlockedEntries;
	}

	private async replaceUnlockedEntries(entries: TotpEntryRecord[]): Promise<void> {
		this.unlockedEntries = reindexTotpEntries(entries);
		await this.reencryptUnlockedEntries(this.sessionPassword);
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

	private async persistPluginData(): Promise<void> {
		await this.dependencies.saveData(this.pluginData);
	}
}
