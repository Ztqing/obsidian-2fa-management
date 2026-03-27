import { createTotpSnapshot } from "../../totp/totp";
import type TwoFactorManagementPlugin from "../../plugin";
import type {
	TotpCodeSnapshot,
	TotpEntryRecord,
	TranslationVariables,
} from "../../types";
import { copyTextToClipboard } from "../../utils/clipboard";
import {
	getCardKeyboardAction,
	shouldCopyCodeFromCardClick,
} from "./card-interactions";
import { TotpManagerViewCopyFeedbackController } from "./totp-manager-view-copy-feedback";
import { TotpManagerViewDragController } from "./totp-manager-view-drag-controller";
import {
	MenuTarget,
	TotpManagerViewMenuAdapter,
	type TotpManagerViewMenuLike,
	TotpManagerViewMenuController,
} from "./totp-manager-view-menus";
import type { TotpCodeRefreshController } from "./totp-manager-view-code-refresh";
import type { TotpManagerViewRendererActions } from "./totp-manager-view-renderer";
import { TotpManagerViewState } from "./totp-manager-view-state";
import type { TotpManagerViewRenderMode } from "./totp-manager-view-renderer";

type TranslationKey = Parameters<TwoFactorManagementPlugin["t"]>[0];

export interface TotpManagerViewControllerEnvironment {
	confirmAndResetVault(): Promise<boolean>;
	confirmAndDeleteEntries(entries: readonly TotpEntryRecord[]): Promise<boolean>;
	confirmAndDeleteEntry(entry: TotpEntryRecord): Promise<boolean>;
	copyTextToClipboard(text: string): Promise<void>;
	createMenu(): TotpManagerViewMenuLike;
	createTotpSnapshot(entry: TotpEntryRecord): Promise<TotpCodeSnapshot>;
	getEntries(): TotpEntryRecord[];
	getErrorMessage(error: unknown): string;
	handleAddEntryCommand(): Promise<boolean>;
	handleBulkImportOtpauthLinksCommand(): Promise<boolean>;
	lockVault(showNotice?: boolean): void;
	promptToEditEntry(entry: TotpEntryRecord): Promise<boolean>;
	promptToInitializeVault(): Promise<boolean>;
	promptToUnlockVault(): Promise<boolean>;
	reorderEntriesByIds(nextOrderedIds: readonly string[]): Promise<void>;
	showNotice(message: string): void;
	t(key: TranslationKey, variables?: TranslationVariables): string;
}

export function createTotpManagerViewControllerEnvironment(
	plugin: TwoFactorManagementPlugin,
): TotpManagerViewControllerEnvironment {
	return {
		confirmAndResetVault: async () => plugin.confirmAndResetVault(),
		confirmAndDeleteEntries: async (entries) =>
			plugin.confirmAndDeleteEntries(entries),
		confirmAndDeleteEntry: async (entry) => plugin.confirmAndDeleteEntry(entry),
		copyTextToClipboard: async (text) => copyTextToClipboard(text),
		createMenu: () => new TotpManagerViewMenuAdapter(),
		createTotpSnapshot: async (entry) => createTotpSnapshot(entry),
		getEntries: () => plugin.getEntries(),
		getErrorMessage: (error) => plugin.getErrorMessage(error),
		handleAddEntryCommand: async () => plugin.handleAddEntryCommand(),
		handleBulkImportOtpauthLinksCommand: async () =>
			plugin.handleBulkImportOtpauthLinksCommand(),
		lockVault: (showNotice = false) => {
			plugin.lockVault(showNotice);
		},
		promptToEditEntry: async (entry) => plugin.promptToEditEntry(entry),
		promptToInitializeVault: async () => plugin.promptToInitializeVault(),
		promptToUnlockVault: async () => plugin.promptToUnlockVault(),
		reorderEntriesByIds: async (nextOrderedIds) =>
			plugin.reorderEntriesByIds(nextOrderedIds),
		showNotice: (message) => {
			plugin.showNotice(message);
		},
		t: (key, variables = {}) => plugin.t(key, variables),
	};
}

export class TotpManagerViewController {
	private readonly copyFeedback = new TotpManagerViewCopyFeedbackController();
	private readonly dragController: TotpManagerViewDragController;
	private readonly menuController: TotpManagerViewMenuController;

	constructor(
		private readonly environment: TotpManagerViewControllerEnvironment,
		private readonly state: TotpManagerViewState,
		private readonly codeRefresh: Pick<
			TotpCodeRefreshController,
			"syncDragState"
		>,
		private readonly requestRefresh: (mode?: TotpManagerViewRenderMode) => Promise<void>,
	) {
		this.dragController = new TotpManagerViewDragController(
			{
				getEntries: () => this.environment.getEntries(),
				reorderEntriesByIds: async (nextOrderedIds) =>
					this.environment.reorderEntriesByIds(nextOrderedIds),
			},
			this.state,
			this.codeRefresh,
		);
		this.menuController = new TotpManagerViewMenuController({
			createMenu: () => this.environment.createMenu(),
			t: (key) => this.environment.t(key),
		});
	}

	createRendererActions(): TotpManagerViewRendererActions {
		return {
			onAddEntry: () => {
				void this.handleAddEntry();
			},
			onBulkImport: () => {
				void this.handleBulkImport();
			},
			onCardClick: (entry, card, event) => {
				void this.handleCardClick(entry, event, card);
			},
			onCardContextMenu: (entry, event) => {
				this.handleCardContextMenu(entry, event);
			},
			onCardKeyDown: (entry, card, event) => {
				void this.handleCardKeyDown(entry, card, event);
			},
			onCardPointerDown: (entry, event) => {
				this.handleCardPointerDown(entry, event);
			},
			onCardPointerEnd: (entry, card, event) => {
				void this.handleCardPointerEnd(entry, card, event);
			},
			onCardPointerLeave: (event) => {
				this.handleCardPointerLeave(event);
			},
			onCardPointerCancel: (event) => {
				this.handleCardPointerCancel(event);
			},
			onCardPointerMove: (entry, card, event) => {
				this.handleCardPointerMove(entry, card, event);
			},
			onClearVault: () => {
				void this.handleClearVault();
			},
			onCreateVault: () => {
				void this.handleCreateVault();
			},
			onDeleteSelected: () => {
				void this.deleteSelectedEntries();
			},
			onExitSelectionMode: () => {
				void this.exitSelectionMode();
			},
			onOpenMoreMenu: (target) => {
				this.openToolbarMenu(target);
			},
			onSearchQueryChange: (query) => {
				void this.updateSearchQuery(query);
			},
			onSelectAllVisible: () => {
				void this.selectAllVisibleEntries();
			},
			onUnlockVault: () => {
				void this.handleUnlockVault();
			},
		};
	}

	async handleClearVault(): Promise<boolean> {
		return this.environment.confirmAndResetVault();
	}

	async handleAddEntry(): Promise<boolean> {
		return this.environment.handleAddEntryCommand();
	}

	async handleBulkImport(): Promise<boolean> {
		return this.environment.handleBulkImportOtpauthLinksCommand();
	}

	async handleCreateVault(): Promise<boolean> {
		return this.environment.promptToInitializeVault();
	}

	lockVault(): void {
		this.environment.lockVault(true);
	}

	async handleUnlockVault(): Promise<boolean> {
		return this.environment.promptToUnlockVault();
	}

	async updateSearchQuery(query: string): Promise<void> {
		this.state.setSearchQuery(query, this.environment.getEntries());
		await this.requestRefresh("search");
	}

	async selectAllVisibleEntries(): Promise<void> {
		if (this.state.areAllVisibleEntriesSelected()) {
			this.state.clearVisibleEntrySelection();
		} else {
			this.state.selectAllVisibleEntries();
		}

		await this.requestRefresh("body");
	}

	async exitSelectionMode(): Promise<void> {
		this.state.exitSelectionMode();
		await this.requestRefresh("body");
	}

	async enterSelectionMode(entryId?: string): Promise<void> {
		this.state.enterSelectionMode(entryId);
		await this.requestRefresh("body");
	}

	openToolbarMenu(target: MenuTarget): void {
		this.menuController.openToolbarMenu(target, {
			hasVisibleEntries: this.state.getVisibleEntries().length > 0,
			onBulkImport: () => {
				void this.handleBulkImport();
			},
			onEnterSelectionMode: () => {
				void this.enterSelectionMode();
			},
			onLockVault: () => {
				this.lockVault();
			},
		});
	}

	handleCardPointerDown(entry: TotpEntryRecord, event: PointerEvent): void {
		this.dragController.handleCardPointerDown(entry, event);
	}

	async handleCardPointerEnd(
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: PointerEvent,
	): Promise<void> {
		await this.dragController.handleCardPointerEnd(entry, card, event);
	}

	handleCardPointerLeave(event: PointerEvent): void {
		this.dragController.handleCardPointerLeave(event);
	}

	handleCardPointerCancel(event: PointerEvent): void {
		this.dragController.handleCardPointerCancel(event);
	}

	handleCardPointerMove(
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: PointerEvent,
	): void {
		this.dragController.handleCardPointerMove(entry, card, event);
	}

	async handleCardClick(
		entry: TotpEntryRecord,
		event: MouseEvent,
		card?: HTMLElement,
	): Promise<void> {
		if (this.state.consumeSuppressedClick(entry.id)) {
			return;
		}

		if (this.state.isSelectionMode()) {
			this.state.toggleEntrySelection(entry.id);
			await this.requestRefresh("body");
			return;
		}

		if (!shouldCopyCodeFromCardClick(event)) {
			return;
		}

		await this.copyEntryCode(entry, card);
	}

	handleCardContextMenu(entry: TotpEntryRecord, event: MouseEvent): void {
		this.state.clearLongPressState();

		if (this.state.isSelectionMode()) {
			event.preventDefault();
			return;
		}

		event.preventDefault();
		this.showEntryContextMenu(entry, event);
	}

	async handleCardKeyDown(
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: KeyboardEvent,
	): Promise<void> {
		if (event.key === "Escape" && this.state.isSelectionMode()) {
			event.preventDefault();
			this.state.exitSelectionMode();
			await this.requestRefresh();
			return;
		}

		if (
			this.state.isSelectionMode() &&
			(event.key === "Delete" || event.key === "Backspace")
		) {
			event.preventDefault();
			await this.deleteSelectedEntries();
			return;
		}

		const action = getCardKeyboardAction(event);

		if (this.state.isSelectionMode()) {
			if (action === "copy") {
				event.preventDefault();
				this.state.toggleEntrySelection(entry.id);
				await this.requestRefresh("body");
			}
			return;
		}

		if (action === "copy") {
			event.preventDefault();
			await this.copyEntryCode(entry);
			return;
		}

		if (action === "menu") {
			event.preventDefault();
			this.showEntryContextMenu(entry, card);
		}
	}

	async deleteSelectedEntries(): Promise<void> {
		if (this.state.getSelectedCount() === 0) {
			return;
		}

		const selectedEntries = this.state.getSelectedEntries(this.environment.getEntries());
		const didDelete = await this.environment.confirmAndDeleteEntries(selectedEntries);

		if (!didDelete) {
			return;
		}

		this.state.removeEntriesFromSelection(
			selectedEntries,
			this.environment.getEntries().length,
		);
		await this.requestRefresh("full");
	}

	private async copyEntryCode(
		entry: TotpEntryRecord,
		card?: HTMLElement,
	): Promise<void> {
		try {
			const snapshot = await this.environment.createTotpSnapshot(entry);
			await this.environment.copyTextToClipboard(snapshot.code);
			this.copyFeedback.flashCardCodeRow(card);
			this.environment.showNotice(
				this.environment.t("notice.codeCopied", {
					accountName: entry.accountName,
				}),
			);
		} catch (error) {
			this.environment.showNotice(this.environment.getErrorMessage(error));
		}
	}

	async handleGlobalPointerEnd(event: PointerEvent): Promise<void> {
		await this.dragController.handleGlobalPointerEnd(event);
	}

	handleGlobalPointerCancel(event: PointerEvent): void {
		this.dragController.handleGlobalPointerCancel(event);
	}

	private showEntryContextMenu(entry: TotpEntryRecord, target: MenuTarget): void {
		this.menuController.openEntryContextMenu(entry, target, {
			onDeleteEntry: (selectedEntry) => {
				void this.environment.confirmAndDeleteEntry(selectedEntry);
			},
			onEditEntry: (selectedEntry) => {
				void this.environment.promptToEditEntry(selectedEntry);
			},
			onEnterSelectionMode: (entryId) => {
				void this.enterSelectionMode(entryId);
			},
		});
	}

	destroy(): void {
		this.copyFeedback.destroy();
	}
}
