import type {
	TotpEntryDraft,
	TotpEntryRecord,
} from "../types";
import { clearSharedPreparedTotpEntryCache } from "../totp/totp";
import type { TwoFactorPluginActionEnvironment } from "./contracts";
import type { VaultLifecycleService } from "./vault-lifecycle-service";

export class EntryService {
	constructor(
		private readonly environment: TwoFactorPluginActionEnvironment,
		private readonly vaultLifecycle: Pick<
			VaultLifecycleService,
			"ensureVaultReadyForManagement" | "promptToUnlockVault"
		>,
	) {}

	async handleAddEntryCommand(): Promise<boolean> {
		await this.environment.open2FAView();

		const isReady = await this.vaultLifecycle.ensureVaultReadyForManagement();
		if (!isReady) {
			return false;
		}

		const draft = await this.environment.openTotpEntryModal();
		if (!draft) {
			return false;
		}

		try {
			await this.environment.service.addEntry(draft);
			clearSharedPreparedTotpEntryCache();
			await this.environment.refreshAllViews("entries");
			this.environment.showNotice?.(
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

		const isReady = await this.vaultLifecycle.ensureVaultReadyForManagement();
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
			const commitResult = await this.environment.service.commitBulkImport({
				expectedVaultRevision:
					modalResult.expectedVaultRevision ??
					this.environment.service.getVaultRevision(),
				preview: modalResult.preview,
				selectedDuplicateLineNumbers: modalResult.selectedDuplicateLineNumbers,
			});

			if (
				commitResult.addedEntries.length === 0 &&
				commitResult.replacedEntries.length === 0
			) {
				return false;
			}

			clearSharedPreparedTotpEntryCache();
			await this.environment.refreshAllViews("entries");
			this.environment.showNotice?.(
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
			const didUnlock = await this.vaultLifecycle.promptToUnlockVault();
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
			clearSharedPreparedTotpEntryCache();
			await this.environment.refreshAllViews("entries");
			this.environment.showNotice?.(
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
			clearSharedPreparedTotpEntryCache();
			await this.environment.refreshAllViews("entries");
			this.environment.showNotice?.(
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
			clearSharedPreparedTotpEntryCache();
			await this.environment.refreshAllViews("entries");
			this.environment.showNotice?.(
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

	async reorderEntriesByIds(nextOrderedIds: readonly string[]): Promise<void> {
		await this.environment.service.reorderEntriesByIds(nextOrderedIds);
		clearSharedPreparedTotpEntryCache();
		await this.environment.refreshAllViews("entries");
	}

	private showErrorNotice(error: unknown): void {
		this.environment.showNotice?.(this.environment.getErrorMessage(error));
	}
}
