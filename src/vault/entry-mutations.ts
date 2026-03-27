import {
	getNextTotpSortOrder,
	normalizeTotpEntryDraft,
} from "../data/store";
import { createUserError } from "../errors";
import { applyBulkOtpauthImportPreview } from "../import/bulk-otpauth";
import type {
	BulkOtpauthImportCommitResult,
	BulkOtpauthImportSubmission,
	TotpEntryDraft,
	TotpEntryRecord,
} from "../types";

interface VaultEntryMutationsDependencies {
	assertVaultRevision(
		expectedVaultRevision: number,
		errorCode: "bulk_import_preview_stale" | "entry_changed_during_edit",
	): void;
	createId(): string;
	encryptedVaultManager: {
		commitUnlockedEntries(
			entries: readonly TotpEntryRecord[],
			options: {
				bumpVaultRevision: boolean;
				nextPassword?: string;
			},
		): Promise<void>;
	};
	session: {
		requireUnlockedEntries(): TotpEntryRecord[];
	};
}

export class VaultEntryMutations {
	constructor(
		private readonly dependencies: VaultEntryMutationsDependencies,
	) {}

	async addEntry(draft: TotpEntryDraft): Promise<void> {
		const normalizedDraft = normalizeTotpEntryDraft(draft);
		const currentEntries = this.dependencies.session.requireUnlockedEntries();
		const nextEntries = [
			...currentEntries,
			{
				id: this.dependencies.createId(),
				sortOrder: getNextTotpSortOrder(currentEntries),
				...normalizedDraft,
			},
		];
		await this.dependencies.encryptedVaultManager.commitUnlockedEntries(nextEntries, {
			bumpVaultRevision: true,
		});
	}

	async updateEntry(
		entryId: string,
		draft: TotpEntryDraft,
		expectedVaultRevision: number,
	): Promise<void> {
		this.dependencies.assertVaultRevision(
			expectedVaultRevision,
			"entry_changed_during_edit",
		);

		const normalizedDraft = normalizeTotpEntryDraft(draft);
		const currentEntries = this.dependencies.session.requireUnlockedEntries();
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

		await this.dependencies.encryptedVaultManager.commitUnlockedEntries(nextEntries, {
			bumpVaultRevision: true,
		});
	}

	async deleteEntry(entryId: string): Promise<void> {
		const nextEntries = this.dependencies.session
			.requireUnlockedEntries()
			.filter((entry) => entry.id !== entryId);
		await this.dependencies.encryptedVaultManager.commitUnlockedEntries(nextEntries, {
			bumpVaultRevision: true,
		});
	}

	async deleteEntries(entryIds: readonly string[]): Promise<void> {
		const idsToDelete = new Set(entryIds);
		const nextEntries = this.dependencies.session
			.requireUnlockedEntries()
			.filter((entry) => !idsToDelete.has(entry.id));
		await this.dependencies.encryptedVaultManager.commitUnlockedEntries(nextEntries, {
			bumpVaultRevision: true,
		});
	}

	async reorderEntriesByIds(nextOrderedIds: readonly string[]): Promise<void> {
		const currentEntries = this.dependencies.session.requireUnlockedEntries();
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

		await this.dependencies.encryptedVaultManager.commitUnlockedEntries(nextEntries, {
			bumpVaultRevision: true,
		});
	}

	async commitBulkImport(
		submission: BulkOtpauthImportSubmission,
	): Promise<BulkOtpauthImportCommitResult> {
		this.dependencies.assertVaultRevision(
			submission.expectedVaultRevision,
			"bulk_import_preview_stale",
		);

		const commitResult = applyBulkOtpauthImportPreview(submission.preview, {
			existingEntries: this.dependencies.session.requireUnlockedEntries(),
			selectedDuplicateLineNumbers: [...submission.selectedDuplicateLineNumbers],
			createId: () => this.dependencies.createId(),
		});

		if (
			commitResult.addedEntries.length === 0 &&
			commitResult.replacedEntries.length === 0
		) {
			return commitResult;
		}

		await this.dependencies.encryptedVaultManager.commitUnlockedEntries(
			commitResult.nextEntries,
			{
				bumpVaultRevision: true,
			},
		);
		return commitResult;
	}
}
