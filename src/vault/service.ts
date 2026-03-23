import { DEFAULT_PLUGIN_DATA } from "../constants";
import {
	getNextTotpSortOrder,
	normalizePluginData,
	normalizeTotpEntryDraft,
	reindexTotpEntries,
} from "../data/store";
import { createUserError } from "../errors";
import { applyBulkOtpauthImportPreview } from "../import/bulk-otpauth";
import { decryptVaultEntries, encryptVaultEntries } from "../security/crypto";
import type {
	BulkOtpauthImportCommitResult,
	BulkOtpauthImportSubmission,
	PluginData,
	PluginSettings,
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
	private writeQueue: Promise<void> = Promise.resolve();
	private sessionToken = 0;

	constructor(private readonly dependencies: TwoFactorVaultServiceDependencies) {}

	async load(): Promise<void> {
		await this.writeQueue;
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

	getVaultRevision(): number {
		return this.pluginData.vaultRevision;
	}

	getPreferredSide(): PreferredSide {
		return this.pluginData.settings.preferredSide;
	}

	async setPreferredSide(side: PreferredSide): Promise<void> {
		await this.enqueueWrite(async () => {
			await this.persistSettings({
				preferredSide: side,
			});
		});
	}

	shouldShowUpcomingCodes(): boolean {
		return this.pluginData.settings.showUpcomingCodes;
	}

	async setShowUpcomingCodes(value: boolean): Promise<void> {
		await this.enqueueWrite(async () => {
			await this.persistSettings({
				showUpcomingCodes: value,
			});
		});
	}

	shouldShowFloatingLockButton(): boolean {
		return this.pluginData.settings.showFloatingLockButton;
	}

	async setShowFloatingLockButton(value: boolean): Promise<void> {
		await this.enqueueWrite(async () => {
			await this.persistSettings({
				showFloatingLockButton: value,
			});
		});
	}

	async initializeVault(password: string): Promise<void> {
		await this.enqueueWrite(async () => {
			const nextEntries: TotpEntryRecord[] = [];
			const nextVault = await encryptVaultEntries(nextEntries, password);
			const nextPluginData = this.createNextPluginData({
				bumpVaultRevision: true,
				vault: nextVault,
			});

			await this.persistPluginData(nextPluginData);
			this.pluginData = nextPluginData;
			this.beginUnlockedSession(nextEntries, password);
		});
	}

	async unlockVault(password: string): Promise<void> {
		await this.writeQueue;

		if (!this.pluginData.vault) {
			throw createUserError("vault_unlock_required");
		}

		const nextEntries = await decryptVaultEntries(this.pluginData.vault, password);
		this.beginUnlockedSession(nextEntries, password);
	}

	lockVault(): void {
		this.clearUnlockedState();
	}

	async changeMasterPassword(nextPassword: string): Promise<void> {
		await this.enqueueWrite(async () => {
			const currentEntries = this.requireUnlockedEntries();
			const currentSessionToken = this.sessionToken;
			const nextVault = await encryptVaultEntries(currentEntries, nextPassword);
			const nextPluginData = this.createNextPluginData({
				bumpVaultRevision: true,
				vault: nextVault,
			});

			await this.persistPluginData(nextPluginData);
			this.pluginData = nextPluginData;
			this.syncUnlockedSession(currentEntries, nextPassword, currentSessionToken);
		});
	}

	async addEntry(draft: TotpEntryDraft): Promise<void> {
		await this.enqueueWrite(async () => {
			const normalizedDraft = normalizeTotpEntryDraft(draft);
			const currentEntries = this.requireUnlockedEntries();
			const nextEntries = [
				...currentEntries,
				{
					id: this.dependencies.createId(),
					sortOrder: getNextTotpSortOrder(currentEntries),
					...normalizedDraft,
				},
			];
			await this.commitUnlockedEntries(nextEntries, {
				bumpVaultRevision: true,
			});
		});
	}

	async updateEntry(
		entryId: string,
		draft: TotpEntryDraft,
		expectedVaultRevision: number,
	): Promise<void> {
		await this.enqueueWrite(async () => {
			this.assertVaultRevision(expectedVaultRevision, "entry_changed_during_edit");

			const normalizedDraft = normalizeTotpEntryDraft(draft);
			const currentEntries = this.requireUnlockedEntries();
			const existingEntry = currentEntries.find((entry) => entry.id === entryId);

			if (!existingEntry) {
				throw createUserError("entry_not_found");
			}

			const nextEntries = currentEntries.map((entry) => {
				if (entry.id !== entryId) {
					return entry;
				}

				return {
					id: entry.id,
					sortOrder: entry.sortOrder,
					...normalizedDraft,
				};
			});

			await this.commitUnlockedEntries(nextEntries, {
				bumpVaultRevision: true,
			});
		});
	}

	async deleteEntry(entryId: string): Promise<void> {
		await this.enqueueWrite(async () => {
			const nextEntries = this.requireUnlockedEntries().filter((entry) => entry.id !== entryId);
			await this.commitUnlockedEntries(nextEntries, {
				bumpVaultRevision: true,
			});
		});
	}

	async deleteEntries(entryIds: readonly string[]): Promise<void> {
		await this.enqueueWrite(async () => {
			const idsToDelete = new Set(entryIds);
			const nextEntries = this.requireUnlockedEntries().filter(
				(entry) => !idsToDelete.has(entry.id),
			);
			await this.commitUnlockedEntries(nextEntries, {
				bumpVaultRevision: true,
			});
		});
	}

	async reorderEntriesByIds(nextOrderedIds: readonly string[]): Promise<void> {
		await this.enqueueWrite(async () => {
			const currentEntries = this.requireUnlockedEntries();
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

			await this.commitUnlockedEntries(nextEntries, {
				bumpVaultRevision: true,
			});
		});
	}

	async commitBulkImport(
		submission: BulkOtpauthImportSubmission,
	): Promise<BulkOtpauthImportCommitResult> {
		return this.enqueueWrite(async () => {
			this.assertVaultRevision(
				submission.expectedVaultRevision,
				"bulk_import_preview_stale",
			);

			const commitResult = applyBulkOtpauthImportPreview(submission.preview, {
				existingEntries: this.requireUnlockedEntries(),
				selectedDuplicateLineNumbers: [...submission.selectedDuplicateLineNumbers],
				createId: () => this.dependencies.createId(),
			});

			if (
				commitResult.addedEntries.length === 0 &&
				commitResult.replacedEntries.length === 0
			) {
				return commitResult;
			}

			await this.commitUnlockedEntries(commitResult.nextEntries, {
				bumpVaultRevision: true,
			});
			return commitResult;
		});
	}

	async resetVault(): Promise<void> {
		await this.enqueueWrite(async () => {
			const nextPluginData = this.createNextPluginData({
				bumpVaultRevision:
					this.pluginData.vault !== null || (this.unlockedEntries?.length ?? 0) > 0,
				vault: null,
			});

			await this.persistPluginData(nextPluginData);
			this.pluginData = nextPluginData;
			this.clearUnlockedState();
		});
	}

	private requireUnlockedEntries(): TotpEntryRecord[] {
		if (!this.unlockedEntries || !this.sessionPassword) {
			throw createUserError("vault_unlock_required");
		}

		return [...this.unlockedEntries];
	}

	private requireSessionPassword(): string {
		if (!this.sessionPassword) {
			throw createUserError("vault_unlock_required");
		}

		return this.sessionPassword;
	}

	private assertVaultRevision(
		expectedVaultRevision: number,
		errorCode: "bulk_import_preview_stale" | "entry_changed_during_edit",
	): void {
		if (expectedVaultRevision !== this.pluginData.vaultRevision) {
			throw createUserError(errorCode);
		}
	}

	private async commitUnlockedEntries(
		entries: TotpEntryRecord[],
		options: {
			bumpVaultRevision: boolean;
			nextPassword?: string;
		},
	): Promise<void> {
		const nextEntries = reindexTotpEntries(entries);
		const currentSessionToken = this.sessionToken;
		const nextPassword = options.nextPassword ?? this.requireSessionPassword();
		const nextVault = await encryptVaultEntries(nextEntries, nextPassword);
		const nextPluginData = this.createNextPluginData({
			bumpVaultRevision: options.bumpVaultRevision,
			vault: nextVault,
		});

		await this.persistPluginData(nextPluginData);
		this.pluginData = nextPluginData;
		this.syncUnlockedSession(nextEntries, nextPassword, currentSessionToken);
	}

	private createNextPluginData(options: {
		bumpVaultRevision?: boolean;
		settings?: PluginSettings;
		vault?: PluginData["vault"];
	}): PluginData {
		return {
			...this.pluginData,
			settings: options.settings ?? this.pluginData.settings,
			vault:
				typeof options.vault === "undefined" ? this.pluginData.vault : options.vault,
			vaultRevision: options.bumpVaultRevision
				? this.pluginData.vaultRevision + 1
				: this.pluginData.vaultRevision,
		};
	}

	private async persistSettings(nextSettings: Partial<PluginSettings>): Promise<void> {
		const nextPluginData = this.createNextPluginData({
			settings: {
				...this.pluginData.settings,
				...nextSettings,
			},
		});

		await this.persistPluginData(nextPluginData);
		this.pluginData = nextPluginData;
	}

	private beginUnlockedSession(entries: TotpEntryRecord[], password: string): void {
		this.sessionToken += 1;
		this.unlockedEntries = [...entries];
		this.sessionPassword = password;
	}

	private syncUnlockedSession(
		entries: TotpEntryRecord[],
		password: string,
		expectedSessionToken: number,
	): void {
		if (this.sessionToken !== expectedSessionToken) {
			return;
		}

		this.unlockedEntries = [...entries];
		this.sessionPassword = password;
	}

	private clearUnlockedState(): void {
		this.sessionToken += 1;
		this.unlockedEntries = null;
		this.sessionPassword = null;
	}

	private async persistPluginData(data: PluginData): Promise<void> {
		await this.dependencies.saveData(data);
	}

	private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
		const nextOperation = this.writeQueue.then(operation, operation);
		this.writeQueue = nextOperation.then(
			() => undefined,
			() => undefined,
		);
		return nextOperation;
	}
}
