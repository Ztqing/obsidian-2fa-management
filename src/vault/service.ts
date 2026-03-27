import { createUserError } from "../errors";
import { decryptVaultEntries } from "../security/crypto";
import {
	createPersistedUnlockStorage,
	type PersistedUnlockStorage,
} from "../security/persisted-unlock";
import type {
	BulkOtpauthImportCommitResult,
	BulkOtpauthImportSubmission,
	LockTimeoutMode,
	PluginData,
	PersistedUnlockCapability,
	PreferredSide,
	TotpEntryDraft,
	TotpEntryRecord,
	VaultLoadIssue,
} from "../types";
import { EncryptedVaultManager } from "./encrypted-vault-manager";
import { VaultEntryMutations } from "./entry-mutations";
import { VaultPersistedUnlockManager } from "./persisted-unlock-manager";
import { VaultRepository, type VaultRepositoryDependencies } from "./repository";
import { VaultSettingsManager } from "./settings-manager";
import { VaultSession } from "./session";

export interface TwoFactorVaultServiceDependencies extends VaultRepositoryDependencies {
	createId: () => string;
	decryptEntries?: (
		encryptedVault: NonNullable<PluginData["vault"]>,
		password: string,
	) => Promise<TotpEntryRecord[]>;
	persistedUnlockStorage?: PersistedUnlockStorage;
}

export class TwoFactorVaultService {
	private readonly repository: VaultRepository;
	private readonly session = new VaultSession();
	private readonly encryptedVaultManager: EncryptedVaultManager;
	private readonly persistedUnlockStorage: PersistedUnlockStorage;
	private readonly settingsManager: VaultSettingsManager;
	private readonly entryMutations: VaultEntryMutations;
	private readonly persistedUnlockManager: VaultPersistedUnlockManager;
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(private readonly dependencies: TwoFactorVaultServiceDependencies) {
		this.repository = new VaultRepository(dependencies);
		this.encryptedVaultManager = new EncryptedVaultManager(
			this.repository,
			this.session,
		);
		this.persistedUnlockStorage =
			dependencies.persistedUnlockStorage ?? createPersistedUnlockStorage();
		this.persistedUnlockManager = new VaultPersistedUnlockManager({
			decryptEntries: dependencies.decryptEntries,
			persistedUnlockStorage: this.persistedUnlockStorage,
			repository: this.repository,
			session: this.session,
		});
		this.settingsManager = new VaultSettingsManager({
			persistedUnlockManager: this.persistedUnlockManager,
			repository: this.repository,
			session: this.session,
		});
		this.entryMutations = new VaultEntryMutations({
			assertVaultRevision: (expectedVaultRevision, errorCode) => {
				this.assertVaultRevision(expectedVaultRevision, errorCode);
			},
			createId: () => this.dependencies.createId(),
			encryptedVaultManager: this.encryptedVaultManager,
			session: this.session,
		});
	}

	async load(): Promise<void> {
		await this.writeQueue;
		await this.repository.load();
		this.session.clear();
		await this.persistedUnlockManager.restorePersistedUnlockIfAvailable();
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

	getLockTimeoutMode(): LockTimeoutMode {
		return this.repository.getLockTimeoutMode();
	}

	getLockTimeoutMinutes(): number {
		return this.repository.getLockTimeoutMinutes();
	}

	getPersistedUnlockCapability(): PersistedUnlockCapability {
		return this.persistedUnlockManager.getCapability();
	}

	isInsecurePersistedUnlockFallbackEnabled(): boolean {
		return this.repository.isInsecurePersistedUnlockFallbackEnabled();
	}

	async setPreferredSide(side: PreferredSide): Promise<void> {
		await this.enqueueWrite(async () => this.settingsManager.setPreferredSide(side));
	}

	shouldShowUpcomingCodes(): boolean {
		return this.repository.shouldShowUpcomingCodes();
	}

	async setShowUpcomingCodes(value: boolean): Promise<void> {
		await this.enqueueWrite(async () => this.settingsManager.setShowUpcomingCodes(value));
	}

	async setInsecurePersistedUnlockFallbackEnabled(enabled: boolean): Promise<void> {
		await this.enqueueWrite(async () =>
			this.persistedUnlockManager.setInsecurePersistedUnlockFallbackEnabled(enabled),
		);
	}

	async setLockTimeoutMode(mode: LockTimeoutMode): Promise<void> {
		await this.enqueueWrite(async () =>
			this.persistedUnlockManager.setLockTimeoutMode(mode),
		);
	}

	async setLockTimeoutMinutes(minutes: number): Promise<void> {
		await this.enqueueWrite(async () =>
			this.settingsManager.setLockTimeoutMinutes(minutes),
		);
	}

	async initializeVault(password: string): Promise<void> {
		await this.enqueueWrite(async () => {
			this.assertVaultCanBeCreated();
			await this.encryptedVaultManager.initialize(password, {
				persistedUnlock: this.persistedUnlockManager.createPersistedUnlockData(password),
			});
		});
	}

	async unlockVault(password: string): Promise<void> {
		await this.writeQueue;
		this.assertVaultAvailable();
		const pluginData = this.repository.getPluginData();

		if (!pluginData.vault) {
			throw createUserError("vault_unlock_required");
		}

		const unlockAttemptToken = this.session.startUnlockAttempt();
		const nextEntries = await (
			this.dependencies.decryptEntries ?? decryptVaultEntries
		)(pluginData.vault, password);
		const didUnlock = this.session.completeUnlock(
			nextEntries,
			password,
			unlockAttemptToken,
		);

		if (!didUnlock || this.repository.getLockTimeoutMode() !== "never") {
			return;
		}

		void this.enqueueWrite(async () => {
			if (this.session.getSessionToken() !== unlockAttemptToken) {
				return;
			}

			await this.persistedUnlockManager.refreshPersistedUnlockBestEffort(password);
		}).catch(() => undefined);
	}

	clearSession(): void {
		this.session.clear();
	}

	lockVault(): void {
		this.clearSession();

		if (this.repository.getPersistedUnlock() === null) {
			return;
		}

		void this.enqueueWrite(async () => {
			await this.persistedUnlockManager.clearPersistedUnlockBestEffort();
		}).catch(() => undefined);
	}

	async changeMasterPassword(nextPassword: string): Promise<void> {
		await this.enqueueWrite(async () => {
			this.assertVaultAvailable();
			await this.encryptedVaultManager.changeMasterPassword(nextPassword, {
				persistedUnlock: this.persistedUnlockManager.createPersistedUnlockData(nextPassword),
			});
		});
	}

	async addEntry(draft: TotpEntryDraft): Promise<void> {
		await this.enqueueWrite(async () => this.entryMutations.addEntry(draft));
	}

	async updateEntry(
		entryId: string,
		draft: TotpEntryDraft,
		expectedVaultRevision: number,
	): Promise<void> {
		await this.enqueueWrite(async () =>
			this.entryMutations.updateEntry(entryId, draft, expectedVaultRevision),
		);
	}

	async deleteEntry(entryId: string): Promise<void> {
		await this.enqueueWrite(async () => this.entryMutations.deleteEntry(entryId));
	}

	async deleteEntries(entryIds: readonly string[]): Promise<void> {
		await this.enqueueWrite(async () => this.entryMutations.deleteEntries(entryIds));
	}

	async reorderEntriesByIds(nextOrderedIds: readonly string[]): Promise<void> {
		await this.enqueueWrite(async () =>
			this.entryMutations.reorderEntriesByIds(nextOrderedIds),
		);
	}

	async commitBulkImport(
		submission: BulkOtpauthImportSubmission,
	): Promise<BulkOtpauthImportCommitResult> {
		return this.enqueueWrite(async () =>
			this.entryMutations.commitBulkImport(submission),
		);
	}

	async resetVault(): Promise<void> {
		await this.enqueueWrite(async () => {
			await this.encryptedVaultManager.resetVault({
				persistedUnlock: null,
			});
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
