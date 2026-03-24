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
import type { TotpManagerViewRenderMode } from "./totp-manager-view-renderer";

interface TotpManagerViewMenuItemLike {
	onClick(callback: () => void): this;
	setDanger(isDanger?: boolean): this;
	setIcon(icon: string): this;
	setTitle(title: string): this;
}

interface TotpManagerViewMenuLike {
	addItem(callback: (item: TotpManagerViewMenuItemLike) => void): this;
	addSeparator(): this;
	showAtMouseEvent(event: MouseEvent): void;
	showAtPosition(position: {
		left?: boolean;
		width?: number;
		x: number;
		y: number;
	}): void;
}

interface ObsidianMenuItemLike {
	onClick(callback: (event: MouseEvent | KeyboardEvent) => void): this;
	setIcon(icon: string | null): this;
	setTitle(title: string | DocumentFragment): this;
}

function createDangerMenuTitle(title: string): string | DocumentFragment {
	if (
		typeof document === "undefined" ||
		typeof document.createDocumentFragment !== "function"
	) {
		return title;
	}

	const fragment = document.createDocumentFragment();
	const label = document.createElement("span");
	label.className = "twofa-menu-item-danger";
	label.textContent = title;
	fragment.append(label);
	return fragment;
}

class TotpManagerViewMenuItemAdapter implements TotpManagerViewMenuItemLike {
	private title = "";
	private isDanger = false;

	constructor(private readonly item: ObsidianMenuItemLike) {}

	onClick(callback: () => void): this {
		this.item.onClick(() => {
			callback();
		});
		return this;
	}

	setDanger(isDanger = true): this {
		this.isDanger = isDanger;
		this.applyTitle();
		return this;
	}

	setIcon(icon: string): this {
		this.item.setIcon(icon);
		return this;
	}

	setTitle(title: string): this {
		this.title = title;
		this.applyTitle();
		return this;
	}

	private applyTitle(): void {
		if (this.title.length === 0) {
			return;
		}

		this.item.setTitle(
			this.isDanger ? createDangerMenuTitle(this.title) : this.title,
		);
	}
}

class TotpManagerViewMenuAdapter implements TotpManagerViewMenuLike {
	private readonly menu = new Menu().setUseNativeMenu(false);

	addItem(callback: (item: TotpManagerViewMenuItemLike) => void): this {
		this.menu.addItem((item) => {
			callback(new TotpManagerViewMenuItemAdapter(item));
		});
		return this;
	}

	addSeparator(): this {
		this.menu.addSeparator();
		return this;
	}

	showAtMouseEvent(event: MouseEvent): void {
		this.menu.showAtMouseEvent(event);
	}

	showAtPosition(position: {
		left?: boolean;
		width?: number;
		x: number;
		y: number;
	}): void {
		this.menu.showAtPosition(position);
	}
}

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

type MenuTarget = MouseEvent | Pick<HTMLElement, "getBoundingClientRect">;

function isMouseEventTarget(target: MenuTarget): target is MouseEvent {
	return (
		typeof (target as MouseEvent).clientX === "number" &&
		typeof (target as MouseEvent).clientY === "number"
	);
}

function getMenuPositionFromTarget(target: MenuTarget): {
	left?: boolean;
	width?: number;
	x: number;
	y: number;
} {
	if (isMouseEventTarget(target)) {
		return {
			x: target.clientX,
			y: target.clientY,
		};
	}

	const rect = target.getBoundingClientRect();
	return {
		x: rect.right - 12,
		y: rect.top + Math.min(rect.height / 2, 48),
		width: rect.width,
		left: true,
	};
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
		private readonly requestRefresh: (mode?: TotpManagerViewRenderMode) => Promise<void>,
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

	async enterSelectionMode(entryId: string): Promise<void> {
		this.state.enterSelectionMode(entryId);
		await this.requestRefresh("body");
	}

	handleCardPointerDown(entry: TotpEntryRecord, event: PointerEvent): void {
		this.state.handlePointerDown(entry.id, event, () => {
			if (!this.state.beginDrag(entry.id, event.pointerId)) {
				return;
			}

			this.codeRefresh.syncDragState(this.state.getDragState());
		});
	}

	async handleCardPointerEnd(
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: PointerEvent,
	): Promise<void> {
		if (!this.state.isDraggingPointer(event.pointerId)) {
			this.state.clearLongPressState(event.pointerId);
			return;
		}

		if (!this.state.getDragState()?.movedIds.includes(entry.id)) {
			const placement = getEntryDropPlacement(card.getBoundingClientRect(), event.clientY);
			if (this.state.updateDragTarget(entry.id, placement)) {
				this.codeRefresh.syncDragState(this.state.getDragState());
			}
		}

		await this.commitPointerDrag(event.pointerId);
	}

	handleCardPointerLeave(event: PointerEvent): void {
		if (this.state.getDragState()) {
			return;
		}

		this.state.clearLongPressState(event.pointerId);
	}

	handleCardPointerCancel(event: PointerEvent): void {
		this.state.clearLongPressState(event.pointerId);
		if (!this.state.isDraggingPointer(event.pointerId)) {
			return;
		}

		this.state.clearDragState(event.pointerId);
		this.codeRefresh.syncDragState(null);
	}

	handleCardPointerMove(
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: PointerEvent,
	): void {
		const thresholdExceededEntryId = this.state.handlePointerMove(event);
		if (
			this.state.isSelectionMode() &&
			!this.state.isDraggingPointer(event.pointerId) &&
			thresholdExceededEntryId
		) {
			if (this.state.beginDrag(thresholdExceededEntryId, event.pointerId)) {
				this.codeRefresh.syncDragState(this.state.getDragState());
			}
		}

		if (!this.state.isDraggingPointer(event.pointerId)) {
			return;
		}

		const placement = getEntryDropPlacement(card.getBoundingClientRect(), event.clientY);
		if (this.state.updateDragTarget(entry.id, placement)) {
			this.codeRefresh.syncDragState(this.state.getDragState());
		}
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
			await this.requestRefresh("body");
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

	async handleGlobalPointerEnd(event: PointerEvent): Promise<void> {
		if (!this.state.isDraggingPointer(event.pointerId)) {
			this.state.clearLongPressState(event.pointerId);
			return;
		}

		await this.commitPointerDrag(event.pointerId);
	}

	handleGlobalPointerCancel(event: PointerEvent): void {
		this.state.clearLongPressState(event.pointerId);
		if (!this.state.isDraggingPointer(event.pointerId)) {
			return;
		}

		this.state.clearDragState(event.pointerId);
		this.codeRefresh.syncDragState(null);
	}

	private async commitPointerDrag(pointerId: number): Promise<void> {
		const dragState = this.state.getDragState();

		this.state.clearDragState(pointerId);
		this.codeRefresh.syncDragState(null);

		if (!dragState) {
			return;
		}

		if (dragState.overEntryId === null) {
			return;
		}

		const currentEntries = this.environment.getEntries();
		const nextOrderedIds = reorderVisibleEntries(
			currentEntries,
			this.state.getVisibleEntries().map((visibleEntry) => visibleEntry.id),
			dragState.movedIds,
			dragState.overEntryId,
			dragState.placement,
		);
		const didChange = nextOrderedIds.some(
			(entryId, index) => entryId !== currentEntries[index]?.id,
		);

		if (!didChange) {
			return;
		}

		await this.environment.reorderEntriesByIds(nextOrderedIds);
	}

	private showEntryContextMenu(entry: TotpEntryRecord, target: MenuTarget): void {
		const menu = this.environment.createMenu();
		menu.addItem((item) => {
			item
				.setTitle(this.environment.t("common.multiSelect"))
				.setIcon("check-square")
				.onClick(() => {
					void this.enterSelectionMode(entry.id);
				});
		});
		menu.addSeparator();
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
				.setDanger()
				.setIcon("trash-2")
				.onClick(() => {
					void this.environment.confirmAndDeleteEntry(entry);
				});
		});
		this.showMenuAtTarget(menu, target);
	}

	private showMenuAtTarget(
		menu: TotpManagerViewMenuLike,
		target: MenuTarget,
	): void {
		if (isMouseEventTarget(target)) {
			menu.showAtMouseEvent(target);
			return;
		}

		menu.showAtPosition(getMenuPositionFromTarget(target));
	}
}
