import {
	getNextTotpSortOrder,
	normalizeTotpEntryDraft,
} from "../data/store";
import { createUserError } from "../errors";
import { applyBulkOtpauthImportPreview } from "../import/bulk-otpauth";
import { decryptVaultEntries } from "../security/crypto";
import type {
	BulkOtpauthImportCommitResult,
	BulkOtpauthImportSubmission,
	PluginData,
	PreferredSide,
	TotpEntryDraft,
	TotpEntryRecord,
	VaultLoadIssue,
} from "../types";
import { EncryptedVaultManager } from "./encrypted-vault-manager";
import { VaultRepository, type VaultRepositoryDependencies } from "./repository";
import { VaultSession } from "./session";

export interface TwoFactorVaultServiceDependencies extends VaultRepositoryDependencies {
	createId: () => string;
}

export class TwoFactorVaultService {
	private readonly repository: VaultRepository;
	private readonly session = new VaultSession();
	private readonly encryptedVaultManager: EncryptedVaultManager;
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(private readonly dependencies: TwoFactorVaultServiceDependencies) {
		this.repository = new VaultRepository(dependencies);
		this.encryptedVaultManager = new EncryptedVaultManager(
			this.repository,
			this.session,
		);
	}

	async load(): Promise<void> {
		await this.writeQueue;
		await this.repository.load();
		this.session.clear();
	}

	isVaultInitialized(): boolean {
		return this.repository.isVaultInitialized();
	}

	isUnlocked(): boolean {
		return this.session.isUnlocked();
	}

	hasVaultLoadIssue(): boolean {
		return this.repository.getVaultLoadIssue() !== null;
	}

	getVaultLoadIssue(): VaultLoadIssue | null {
		return this.repository.getVaultLoadIssue();
	}

	getEntries(): TotpEntryRecord[] {
		return this.session.getEntries();
	}

	getVaultRevision(): number {
		return this.repository.getVaultRevision();
	}

	getPreferredSide(): PreferredSide {
		return this.repository.getPreferredSide();
	}

	async setPreferredSide(side: PreferredSide): Promise<void> {
		await this.enqueueWrite(async () => {
			await this.repository.persistSettings({
				preferredSide: side,
			});
		});
	}

	shouldShowUpcomingCodes(): boolean {
		return this.repository.shouldShowUpcomingCodes();
	}

	async setShowUpcomingCodes(value: boolean): Promise<void> {
		await this.enqueueWrite(async () => {
			await this.repository.persistSettings({
				showUpcomingCodes: value,
			});
		});
	}

	shouldShowFloatingLockButton(): boolean {
		return this.repository.shouldShowFloatingLockButton();
	}

	async setShowFloatingLockButton(value: boolean): Promise<void> {
		await this.enqueueWrite(async () => {
			await this.repository.persistSettings({
				showFloatingLockButton: value,
			});
		});
	}

	async initializeVault(password: string): Promise<void> {
		await this.enqueueWrite(async () => {
			this.assertVaultCanBeCreated();
			await this.encryptedVaultManager.initialize(password);
		});
	}

	async unlockVault(password: string): Promise<void> {
		await this.writeQueue;
		this.assertVaultAvailable();
		const pluginData = this.repository.getPluginData();

		if (!pluginData.vault) {
			throw createUserError("vault_unlock_required");
		}

		const nextEntries = await decryptVaultEntries(pluginData.vault, password);
		this.session.begin(nextEntries, password);
	}

	lockVault(): void {
		this.session.clear();
	}

	async changeMasterPassword(nextPassword: string): Promise<void> {
		await this.enqueueWrite(async () => {
			this.assertVaultAvailable();
			await this.encryptedVaultManager.changeMasterPassword(nextPassword);
		});
	}

	async addEntry(draft: TotpEntryDraft): Promise<void> {
		await this.enqueueWrite(async () => {
			const normalizedDraft = normalizeTotpEntryDraft(draft);
			const currentEntries = this.session.requireUnlockedEntries();
			const nextEntries = [
				...currentEntries,
				{
					id: this.dependencies.createId(),
					sortOrder: getNextTotpSortOrder(currentEntries),
					...normalizedDraft,
				},
			];
			await this.encryptedVaultManager.commitUnlockedEntries(nextEntries, {
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
			const currentEntries = this.session.requireUnlockedEntries();
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

			await this.encryptedVaultManager.commitUnlockedEntries(nextEntries, {
				bumpVaultRevision: true,
			});
		});
	}

	async deleteEntry(entryId: string): Promise<void> {
		await this.enqueueWrite(async () => {
			const nextEntries = this.session
				.requireUnlockedEntries()
				.filter((entry) => entry.id !== entryId);
			await this.encryptedVaultManager.commitUnlockedEntries(nextEntries, {
				bumpVaultRevision: true,
			});
		});
	}

	async deleteEntries(entryIds: readonly string[]): Promise<void> {
		await this.enqueueWrite(async () => {
			const idsToDelete = new Set(entryIds);
			const nextEntries = this.session
				.requireUnlockedEntries()
				.filter((entry) => !idsToDelete.has(entry.id));
			await this.encryptedVaultManager.commitUnlockedEntries(nextEntries, {
				bumpVaultRevision: true,
			});
		});
	}

	async reorderEntriesByIds(nextOrderedIds: readonly string[]): Promise<void> {
		await this.enqueueWrite(async () => {
			const currentEntries = this.session.requireUnlockedEntries();
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

			await this.encryptedVaultManager.commitUnlockedEntries(nextEntries, {
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
				existingEntries: this.session.requireUnlockedEntries(),
				selectedDuplicateLineNumbers: [...submission.selectedDuplicateLineNumbers],
				createId: () => this.dependencies.createId(),
			});

			if (
				commitResult.addedEntries.length === 0 &&
				commitResult.replacedEntries.length === 0
			) {
				return commitResult;
			}

			await this.encryptedVaultManager.commitUnlockedEntries(commitResult.nextEntries, {
				bumpVaultRevision: true,
			});
			return commitResult;
		});
	}

	async resetVault(): Promise<void> {
		await this.enqueueWrite(async () => {
			await this.encryptedVaultManager.resetVault();
		});
	}

	private assertVaultRevision(
		expectedVaultRevision: number,
		errorCode: "bulk_import_preview_stale" | "entry_changed_during_edit",
	): void {
		this.assertVaultAvailable();

		if (expectedVaultRevision !== this.repository.getVaultRevision()) {
			throw createUserError(errorCode);
		}
	}

	private assertVaultAvailable(): void {
		if (this.repository.getVaultLoadIssue() !== null) {
			throw createUserError("vault_repair_required");
		}
	}

	private assertVaultCanBeCreated(): void {
		if (this.repository.getVaultLoadIssue() !== null) {
			throw createUserError("vault_repair_required");
		}
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
