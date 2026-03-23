import { Menu, Notice } from "obsidian";
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
import type { TotpCodeRefreshController } from "./totp-manager-view-code-refresh";
import type { TotpManagerViewRendererActions } from "./totp-manager-view-renderer";
import {
	getEntryDropPlacement,
	TotpManagerViewState,
} from "./totp-manager-view-state";
import { reorderVisibleEntries } from "./entry-order";

interface TotpManagerViewMenuItemLike {
	onClick(callback: () => void): this;
	setIcon(icon: string): this;
	setTitle(title: string): this;
}

interface TotpManagerViewMenuLike {
	addItem(callback: (item: TotpManagerViewMenuItemLike) => void): this;
	showAtMouseEvent(event: MouseEvent): void;
	showAtPosition(position: {
		left?: boolean;
		width?: number;
		x: number;
		y: number;
	}): void;
}

type TranslationKey = Parameters<TwoFactorManagementPlugin["t"]>[0];

export interface TotpManagerViewControllerEnvironment {
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

type MenuTarget = MouseEvent | Pick<HTMLElement, "getBoundingClientRect">;

function isMouseEventTarget(target: MenuTarget): target is MouseEvent {
	return (
		typeof (target as MouseEvent).clientX === "number" &&
		typeof (target as MouseEvent).clientY === "number"
	);
}

export function createTotpManagerViewControllerEnvironment(
	plugin: TwoFactorManagementPlugin,
): TotpManagerViewControllerEnvironment {
	return {
		confirmAndDeleteEntries: async (entries) =>
			plugin.confirmAndDeleteEntries(entries),
		confirmAndDeleteEntry: async (entry) => plugin.confirmAndDeleteEntry(entry),
		copyTextToClipboard: async (text) => copyTextToClipboard(text),
		createMenu: () => new Menu(),
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
			new Notice(message);
		},
		t: (key, variables = {}) => plugin.t(key, variables),
	};
}

export class TotpManagerViewController {
	constructor(
		private readonly environment: TotpManagerViewControllerEnvironment,
		private readonly state: TotpManagerViewState,
		private readonly codeRefresh: Pick<
			TotpCodeRefreshController,
			"syncDragState"
		>,
		private readonly requestRefresh: () => Promise<void>,
	) {}

	createRendererActions(): TotpManagerViewRendererActions {
		return {
			onAddEntry: () => {
				void this.handleAddEntry();
			},
			onBulkImport: () => {
				void this.handleBulkImport();
			},
			onCardClick: (entry, event) => {
				void this.handleCardClick(entry, event);
			},
			onCardContextMenu: (entry, event) => {
				this.handleCardContextMenu(entry, event);
			},
			onCardDragEnd: () => {
				this.handleCardDragEnd();
			},
			onCardDragOver: (entry, card, event) => {
				this.handleCardDragOver(entry, card, event);
			},
			onCardDragStart: (entry, event) => {
				this.handleCardDragStart(entry, event);
			},
			onCardDrop: (entry, card, event) => {
				void this.handleCardDrop(entry, card, event);
			},
			onCardKeyDown: (entry, card, event) => {
				void this.handleCardKeyDown(entry, card, event);
			},
			onCardPointerDown: (entry, event) => {
				this.handleCardPointerDown(entry, event);
			},
			onCardPointerEnd: () => {
				this.handleCardPointerEnd();
			},
			onCardPointerMove: (event) => {
				this.handleCardPointerMove(event);
			},
			onCreateVault: () => {
				void this.handleCreateVault();
			},
			onDeleteSelected: () => {
				void this.deleteSelectedEntries();
			},
			onEditSelected: () => {
				void this.editSelectedEntry();
			},
			onExitSelectionMode: () => {
				void this.exitSelectionMode();
			},
			onLockVault: () => {
				this.lockVault();
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
		await this.requestRefresh();
	}

	async selectAllVisibleEntries(): Promise<void> {
		this.state.selectAllVisibleEntries();
		await this.requestRefresh();
	}

	async exitSelectionMode(): Promise<void> {
		this.state.exitSelectionMode();
		await this.requestRefresh();
	}

	handleCardPointerDown(entry: TotpEntryRecord, event: PointerEvent): void {
		this.state.handlePointerDown(entry.id, event, () => {
			void this.requestRefresh();
		});
	}

	handleCardPointerEnd(): void {
		this.state.clearLongPressState();
	}

	handleCardPointerMove(event: PointerEvent): void {
		this.state.handlePointerMove(event);
	}

	handleCardDragEnd(): void {
		this.state.clearDragState();
		this.codeRefresh.syncDragState(null);
	}

	async handleCardClick(
		entry: TotpEntryRecord,
		event: MouseEvent,
	): Promise<void> {
		if (this.state.consumeSuppressedClick(entry.id)) {
			return;
		}

		if (this.state.isSelectionMode()) {
			this.state.toggleEntrySelection(entry.id);
			await this.requestRefresh();
			return;
		}

		if (!shouldCopyCodeFromCardClick(event)) {
			return;
		}

		await this.copyEntryCode(entry);
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
				await this.requestRefresh();
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

	handleCardDragStart(entry: TotpEntryRecord, event: DragEvent): void {
		const movedIds = this.state.beginDrag(entry.id);

		if (!movedIds) {
			event.preventDefault();
			return;
		}

		event.dataTransfer?.setData("text/plain", movedIds.join("\n"));
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = "move";
		}
		this.codeRefresh.syncDragState(this.state.getDragState());
	}

	handleCardDragOver(
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: DragEvent,
	): void {
		if (!this.state.getDragState()) {
			return;
		}

		event.preventDefault();
		const placement = getEntryDropPlacement(card.getBoundingClientRect(), event.clientY);
		if (this.state.updateDragTarget(entry.id, placement)) {
			this.codeRefresh.syncDragState(this.state.getDragState());
		}
	}

	async handleCardDrop(
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: DragEvent,
	): Promise<void> {
		const dragState = this.state.getDragState();

		if (!dragState) {
			return;
		}

		event.preventDefault();
		if (dragState.movedIds.includes(entry.id)) {
			this.state.clearDragState();
			this.codeRefresh.syncDragState(null);
			return;
		}

		const placement = getEntryDropPlacement(card.getBoundingClientRect(), event.clientY);
		const currentEntries = this.environment.getEntries();
		const nextOrderedIds = reorderVisibleEntries(
			currentEntries,
			this.state.getVisibleEntries().map((visibleEntry) => visibleEntry.id),
			dragState.movedIds,
			entry.id,
			placement,
		);
		const didChange = nextOrderedIds.some(
			(entryId, index) => entryId !== currentEntries[index]?.id,
		);

		this.state.clearDragState();
		this.codeRefresh.syncDragState(null);

		if (!didChange) {
			return;
		}

		this.state.setSelectedEntryIds(dragState.movedIds);
		await this.environment.reorderEntriesByIds(nextOrderedIds);
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
		await this.requestRefresh();
	}

	async editSelectedEntry(): Promise<void> {
		const entryToEdit = this.state.getSingleSelectedEntry(
			this.environment.getEntries(),
		);

		if (!entryToEdit) {
			return;
		}

		const didEdit = await this.environment.promptToEditEntry(entryToEdit);

		if (didEdit) {
			this.state.exitSelectionMode();
			await this.requestRefresh();
		}
	}

	private async copyEntryCode(entry: TotpEntryRecord): Promise<void> {
		try {
			const snapshot = await this.environment.createTotpSnapshot(entry);
			await this.environment.copyTextToClipboard(snapshot.code);
			this.environment.showNotice(
				this.environment.t("notice.codeCopied", {
					accountName: entry.accountName,
				}),
			);
		} catch (error) {
			this.environment.showNotice(this.environment.getErrorMessage(error));
		}
	}

	private showEntryContextMenu(entry: TotpEntryRecord, target: MenuTarget): void {
		const menu = this.environment.createMenu();
		menu.addItem((item) => {
			item
				.setTitle(this.environment.t("common.edit"))
				.setIcon("pencil")
				.onClick(() => {
					void this.environment.promptToEditEntry(entry);
				});
		});
		menu.addItem((item) => {
			item
				.setTitle(this.environment.t("common.delete"))
				.setIcon("trash-2")
				.onClick(() => {
					void this.environment.confirmAndDeleteEntry(entry);
				});
		});

		if (isMouseEventTarget(target)) {
			menu.showAtMouseEvent(target);
			return;
		}

		const rect = target.getBoundingClientRect();
		menu.showAtPosition({
			x: rect.right - 12,
			y: rect.top + Math.min(rect.height / 2, 48),
			width: rect.width,
			left: true,
		});
	}
}
