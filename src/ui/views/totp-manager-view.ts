import { ItemView, Menu, Notice, WorkspaceLeaf } from "obsidian";
import { OBSIDIAN_2FA_VIEW } from "../../constants";
import { createTotpSnapshot } from "../../totp/totp";
import type { TotpEntryRecord } from "../../types";
import { copyTextToClipboard } from "../../utils/clipboard";
import type TwoFactorManagementPlugin from "../../plugin";
import {
	getCardKeyboardAction,
	shouldCopyCodeFromCardClick,
} from "./card-interactions";
import { TotpCodeRefreshController } from "./totp-manager-view-code-refresh";
import {
	TotpManagerViewRenderer,
} from "./totp-manager-view-renderer";
import {
	getEntryDropPlacement,
	TotpManagerViewState,
} from "./totp-manager-view-state";
import { reorderVisibleEntries } from "./entry-order";

export class TotpManagerView extends ItemView {
	private readonly plugin: TwoFactorManagementPlugin;
	private readonly state = new TotpManagerViewState();
	private readonly codeRefresh = new TotpCodeRefreshController();
	private readonly renderer: TotpManagerViewRenderer;

	constructor(leaf: WorkspaceLeaf, plugin: TwoFactorManagementPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.navigation = false;
		this.renderer = new TotpManagerViewRenderer(
			this.plugin,
			this.state,
			this.codeRefresh,
			{
				onAddEntry: () => {
					void this.plugin.handleAddEntryCommand();
				},
				onBulkImport: () => {
					void this.plugin.handleBulkImportOtpauthLinksCommand();
				},
				onCardClick: (entry, event) => {
					void this.handleCardClick(entry, event);
				},
				onCardContextMenu: (entry, event) => {
					this.handleCardContextMenu(entry, event);
				},
				onCardDragEnd: () => {
					this.state.clearDragState();
					this.codeRefresh.syncDragState(null);
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
					this.state.handlePointerDown(entry.id, event, () => {
						void this.refresh();
					});
				},
				onCardPointerEnd: () => {
					this.state.clearLongPressState();
				},
				onCardPointerMove: (event) => {
					this.state.handlePointerMove(event);
				},
				onCreateVault: () => {
					void this.plugin.promptToInitializeVault();
				},
				onDeleteSelected: () => {
					void this.deleteSelectedEntries();
				},
				onEditSelected: () => {
					void this.editSelectedEntry();
				},
				onExitSelectionMode: () => {
					this.state.exitSelectionMode();
					void this.refresh();
				},
				onLockVault: () => {
					this.plugin.lockVault(true);
				},
				onSearchQueryChange: (query) => {
					this.state.setSearchQuery(query, this.plugin.getEntries());
					void this.refresh();
				},
				onSelectAllVisible: () => {
					this.state.selectAllVisibleEntries();
					void this.refresh();
				},
				onUnlockVault: () => {
					void this.plugin.promptToUnlockVault();
				},
			},
		);
	}

	getViewType(): string {
		return OBSIDIAN_2FA_VIEW;
	}

	getDisplayText(): string {
		return this.plugin.t("view.title");
	}

	getIcon(): "key-round" {
		return "key-round";
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		this.addAction("plus", this.plugin.t("command.addEntry"), () => {
			void this.plugin.handleAddEntryCommand();
		});
		this.addAction("import", this.plugin.t("command.bulkImportOtpauthLinks"), () => {
			void this.plugin.handleBulkImportOtpauthLinksCommand();
		});
		this.addAction("lock", this.plugin.t("command.lockVault"), () => {
			this.plugin.lockVault(true);
		});
		this.registerInterval(
			window.setInterval(() => {
				void this.codeRefresh.refreshVisibleCodes(
					this.plugin,
					this.state.getVisibleEntries(),
				);
			}, 1000),
		);
		await this.refresh();
	}

	async onClose(): Promise<void> {
		this.state.resetForUnavailableVault();
		this.codeRefresh.destroy();
		await super.onClose();
	}

	async refresh(): Promise<void> {
		this.renderer.render(this.contentEl, {
			entries: this.plugin.getEntries(),
			isUnlocked: this.plugin.isUnlocked(),
			isVaultInitialized: this.plugin.isVaultInitialized(),
			showUpcomingCodes: this.plugin.shouldShowUpcomingCodes(),
		});
		await this.codeRefresh.refreshVisibleCodes(this.plugin, this.state.getVisibleEntries());
	}

	private async handleCardClick(
		entry: TotpEntryRecord,
		event: MouseEvent,
	): Promise<void> {
		if (this.state.consumeSuppressedClick(entry.id)) {
			return;
		}

		if (this.state.isSelectionMode()) {
			this.state.toggleEntrySelection(entry.id);
			await this.refresh();
			return;
		}

		if (!shouldCopyCodeFromCardClick(event)) {
			return;
		}

		await this.copyEntryCode(entry);
	}

	private handleCardContextMenu(entry: TotpEntryRecord, event: MouseEvent): void {
		this.state.clearLongPressState();

		if (this.state.isSelectionMode()) {
			event.preventDefault();
			return;
		}

		event.preventDefault();
		this.showEntryContextMenu(entry, event);
	}

	private async handleCardKeyDown(
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: KeyboardEvent,
	): Promise<void> {
		if (event.key === "Escape" && this.state.isSelectionMode()) {
			event.preventDefault();
			this.state.exitSelectionMode();
			await this.refresh();
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
				await this.refresh();
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

	private handleCardDragStart(entry: TotpEntryRecord, event: DragEvent): void {
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

	private handleCardDragOver(
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

	private async handleCardDrop(
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
		const nextOrderedIds = reorderVisibleEntries(
			this.plugin.getEntries(),
			this.state.getVisibleEntries().map((visibleEntry) => visibleEntry.id),
			dragState.movedIds,
			entry.id,
			placement,
		);
		const currentEntries = this.plugin.getEntries();
		const didChange = nextOrderedIds.some(
			(entryId, index) => entryId !== currentEntries[index]?.id,
		);

		this.state.clearDragState();
		this.codeRefresh.syncDragState(null);

		if (!didChange) {
			return;
		}

		this.state.setSelectedEntryIds(dragState.movedIds);
		await this.plugin.reorderEntriesByIds(nextOrderedIds);
	}

	private async deleteSelectedEntries(): Promise<void> {
		if (this.state.getSelectedCount() === 0) {
			return;
		}

		const selectedEntries = this.state.getSelectedEntries(this.plugin.getEntries());
		const didDelete = await this.plugin.confirmAndDeleteEntries(selectedEntries);

		if (!didDelete) {
			return;
		}

		this.state.removeEntriesFromSelection(selectedEntries, this.plugin.getEntries().length);
		await this.refresh();
	}

	private async editSelectedEntry(): Promise<void> {
		const entryToEdit = this.state.getSingleSelectedEntry(this.plugin.getEntries());

		if (!entryToEdit) {
			return;
		}

		const didEdit = await this.plugin.promptToEditEntry(entryToEdit);

		if (didEdit) {
			this.state.exitSelectionMode();
			await this.refresh();
		}
	}

	private async copyEntryCode(entry: TotpEntryRecord): Promise<void> {
		try {
			const snapshot = await createTotpSnapshot(entry);
			await copyTextToClipboard(snapshot.code);
			new Notice(
				this.plugin.t("notice.codeCopied", {
					accountName: entry.accountName,
				}),
			);
		} catch (error) {
			new Notice(this.plugin.getErrorMessage(error));
		}
	}

	private showEntryContextMenu(entry: TotpEntryRecord, target: MouseEvent | HTMLElement): void {
		const menu = new Menu();
		menu.addItem((item) => {
			item
				.setTitle(this.plugin.t("common.edit"))
				.setIcon("pencil")
				.onClick(() => {
					void this.plugin.promptToEditEntry(entry);
				});
		});
		menu.addItem((item) => {
			item
				.setTitle(this.plugin.t("common.delete"))
				.setIcon("trash-2")
				.onClick(() => {
					void this.plugin.confirmAndDeleteEntry(entry);
				});
		});

		if (target instanceof MouseEvent) {
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
