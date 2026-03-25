import { EntryService } from "./application/entry-service";
import {
	type TwoFactorPluginActionEnvironment,
	type TwoFactorVaultServiceLike,
} from "./application/contracts";
import { VaultLifecycleService } from "./application/vault-lifecycle-service";
import type { TotpEntryRecord } from "./types";

export type { TwoFactorPluginActionEnvironment, TwoFactorVaultServiceLike };

export class TwoFactorPluginActions {
	private readonly entryService: EntryService;
	private readonly vaultLifecycle: VaultLifecycleService;

	constructor(environment: TwoFactorPluginActionEnvironment) {
		this.vaultLifecycle = new VaultLifecycleService(environment);
		this.entryService = new EntryService(environment, this.vaultLifecycle);
	}

	lockVault(showNotice = false): void {
		this.vaultLifecycle.lockVault(showNotice);
	}

	async promptToInitializeVault(): Promise<boolean> {
		return this.vaultLifecycle.promptToInitializeVault();
	}

	async promptToUnlockVault(): Promise<boolean> {
		return this.vaultLifecycle.promptToUnlockVault();
	}

	async promptToChangeMasterPassword(): Promise<boolean> {
		return this.vaultLifecycle.promptToChangeMasterPassword();
	}

	async handleAddEntryCommand(): Promise<boolean> {
		return this.entryService.handleAddEntryCommand();
	}

	async handleBulkImportOtpauthLinksCommand(): Promise<boolean> {
		return this.entryService.handleBulkImportOtpauthLinksCommand();
	}

	async promptToEditEntry(entry: TotpEntryRecord): Promise<boolean> {
		return this.entryService.promptToEditEntry(entry);
	}

	async confirmAndDeleteEntry(entry: TotpEntryRecord): Promise<boolean> {
		return this.entryService.confirmAndDeleteEntry(entry);
	}

	async confirmAndDeleteEntries(entries: readonly TotpEntryRecord[]): Promise<boolean> {
		return this.entryService.confirmAndDeleteEntries(entries);
	}

	async confirmAndResetVault(): Promise<boolean> {
		return this.vaultLifecycle.confirmAndResetVault();
	}

	async reorderEntriesByIds(nextOrderedIds: readonly string[]): Promise<void> {
		await this.entryService.reorderEntriesByIds(nextOrderedIds);
	}
}
