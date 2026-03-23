import { ItemView, Menu, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import { OBSIDIAN_2FA_VIEW } from "../../constants";
import { filterTotpEntries } from "../../data/store";
import { createTotpDisplaySnapshot } from "../../totp/display";
import { createTotpSnapshot } from "../../totp/totp";
import { resolveProviderIcon } from "../provider-icons";
import { copyTextToClipboard } from "../../utils/clipboard";
import type { TotpEntryRecord } from "../../types";
import type TwoFactorManagementPlugin from "../../plugin";
import {
	getCardKeyboardAction,
	shouldCopyCodeFromCardClick,
	shouldStartCardLongPress,
} from "./card-interactions";
import {
	getCodeTransitionPlan,
	type CodeAnimationMode,
} from "./code-transition";
import {
	reorderVisibleEntries,
	type EntryDropPlacement,
} from "./entry-order";

const LONG_PRESS_DELAY_MS = 350;
const LONG_PRESS_MOVE_THRESHOLD_PX = 8;
const CODE_TRANSITION_SLIDE_DURATION_MS = 190;
const CODE_TRANSITION_FADE_DURATION_MS = 140;

interface EntryRowRefs {
	cardEl: HTMLElement;
	codeEl: HTMLElement;
	countdownBadgeEl: HTMLElement;
	countdownEl: HTMLElement;
	nextCodeEl: HTMLElement | null;
	previousCurrentCode: string | null;
	codeAnimationTimeoutId: number | null;
	codeAnimationToken: number;
}

interface DragState {
	movedIds: string[];
	overEntryId: string | null;
	placement: EntryDropPlacement;
}

export class TotpManagerView extends ItemView {
	private readonly plugin: TwoFactorManagementPlugin;
	private searchQuery = "";
	private visibleEntries: TotpEntryRecord[] = [];
	private rowRefs = new Map<string, EntryRowRefs>();
	private refreshRun = 0;
	private isSelectionMode = false;
	private selectedEntryIds = new Set<string>();
	private longPressTimer: number | null = null;
	private longPressPointerId: number | null = null;
	private longPressStartX = 0;
	private longPressStartY = 0;
	private suppressedClickEntryId: string | null = null;
	private dragState: DragState | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TwoFactorManagementPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.navigation = false;
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
				void this.refreshVisibleCodes();
			}, 1000),
		);
		await this.refresh();
	}

	async onClose(): Promise<void> {
		this.clearLongPressState();
		this.clearDragState();
		this.clearCodeTransitions();
		await super.onClose();
	}

	async refresh(): Promise<void> {
		this.render();
		await this.refreshVisibleCodes();
	}

	private render(): void {
		this.clearCodeTransitions();
		this.contentEl.empty();
		this.contentEl.addClass("twofa-view");
		this.rowRefs.clear();
		this.visibleEntries = [];
		this.clearDragState();

		if (!this.plugin.isVaultInitialized()) {
			this.resetSelectionState();
			this.renderUninitializedState();
			return;
		}

		if (!this.plugin.isUnlocked()) {
			this.resetSelectionState();
			this.renderLockedState();
			return;
		}

		this.renderUnlockedState();
	}

	private renderUninitializedState(): void {
		const wrapper = this.contentEl.createDiv({
			cls: "twofa-empty-state",
		});
		wrapper.createEl("h3", {
			text: this.plugin.t("view.uninitialized.title"),
		});
		wrapper.createEl("p", {
			text: this.plugin.t("view.uninitialized.description"),
		});
		const actions = wrapper.createDiv({
			cls: "twofa-inline-actions",
		});
		const initializeButton = actions.createEl("button", {
			text: this.plugin.t("common.createVault"),
		});
		initializeButton.addClass("mod-cta");
		initializeButton.addEventListener("click", () => {
			void this.plugin.promptToInitializeVault();
		});
	}

	private renderLockedState(): void {
		const wrapper = this.contentEl.createDiv({
			cls: "twofa-empty-state",
		});
		wrapper.createEl("h3", {
			text: this.plugin.t("view.locked.title"),
		});
		wrapper.createEl("p", {
			text: this.plugin.t("view.locked.description"),
		});
		const actions = wrapper.createDiv({
			cls: "twofa-inline-actions",
		});
		const unlockButton = actions.createEl("button", {
			text: this.plugin.t("common.unlockVault"),
		});
		unlockButton.addClass("mod-cta");
		unlockButton.addEventListener("click", () => {
			void this.plugin.promptToUnlockVault();
		});
	}

	private renderUnlockedState(): void {
		const showUpcomingCodes = this.plugin.shouldShowUpcomingCodes();
		const allEntries = this.plugin.getEntries();
		this.visibleEntries = filterTotpEntries(allEntries, this.searchQuery);
		this.pruneSelectionToExistingEntries(allEntries);

		const toolbar = this.contentEl.createDiv({
			cls: "twofa-toolbar",
		});
		const searchInput = toolbar.createEl("input", {
			type: "search",
			placeholder: this.plugin.t("view.search.placeholder"),
		});
		searchInput.addClass("twofa-search-input");
		searchInput.value = this.searchQuery;
		searchInput.addEventListener("input", (event) => {
			this.searchQuery = (event.target as HTMLInputElement).value;
			void this.refresh();
		});

		const actionGroup = toolbar.createDiv({
			cls: "twofa-inline-actions",
		});
		const addButton = actionGroup.createEl("button", {
			text: this.plugin.t("common.addEntry"),
		});
		addButton.addClass("mod-cta");
		addButton.addEventListener("click", () => {
			void this.plugin.handleAddEntryCommand();
		});

		const importButton = actionGroup.createEl("button", {
			text: this.plugin.t("common.bulkImport"),
		});
		importButton.addEventListener("click", () => {
			void this.plugin.handleBulkImportOtpauthLinksCommand();
		});

		const lockButton = actionGroup.createEl("button", {
			text: this.plugin.t("common.lock"),
		});
		lockButton.addEventListener("click", () => {
			this.plugin.lockVault(true);
		});

		this.renderSummaryBar();

		if (this.visibleEntries.length === 0) {
			const emptyState = this.contentEl.createDiv({
				cls: "twofa-empty-state twofa-empty-state--compact",
			});
			emptyState.createEl("p", {
				text:
					this.searchQuery.trim().length > 0
						? this.plugin.t("view.empty.search")
						: this.plugin.t("view.empty.entries"),
			});
			return;
		}

		const list = this.contentEl.createDiv({
			cls: "twofa-entry-list",
		});

		for (const entry of this.visibleEntries) {
			const isSelected = this.selectedEntryIds.has(entry.id);
			const card = list.createDiv({
				cls: "twofa-entry-card",
			});
			card.toggleClass("is-selected", isSelected);
			card.toggleClass("is-selection-mode", this.isSelectionMode);
			card.draggable = this.isSelectionMode;
			card.tabIndex = 0;
			card.setAttribute("role", this.isSelectionMode ? "checkbox" : "button");
			if (this.isSelectionMode) {
				card.setAttribute("aria-checked", String(isSelected));
			}
			card.setAttribute(
				"aria-label",
				this.plugin.t("view.entry.cardAriaLabel", {
					accountName: entry.accountName,
				}),
			);
			card.addEventListener("pointerdown", (event) => {
				this.handleCardPointerDown(entry, event);
			});
			card.addEventListener("pointermove", (event) => {
				this.handleCardPointerMove(event);
			});
			card.addEventListener("pointerup", () => {
				this.clearLongPressState();
			});
			card.addEventListener("pointerleave", () => {
				this.clearLongPressState();
			});
			card.addEventListener("pointercancel", () => {
				this.clearLongPressState();
			});
			card.addEventListener("click", (event) => {
				void this.handleCardClick(entry, event);
			});
			card.addEventListener("contextmenu", (event) => {
				this.clearLongPressState();

				if (this.isSelectionMode) {
					event.preventDefault();
					return;
				}

				event.preventDefault();
				this.showEntryContextMenu(entry, event);
			});
			card.addEventListener("keydown", (event) => {
				void this.handleCardKeyDown(entry, card, event);
			});
			card.addEventListener("dragstart", (event) => {
				this.handleCardDragStart(entry, event);
			});
			card.addEventListener("dragover", (event) => {
				this.handleCardDragOver(entry, card, event);
			});
			card.addEventListener("drop", (event) => {
				void this.handleCardDrop(entry, card, event);
			});
			card.addEventListener("dragend", () => {
				this.clearDragState();
			});

			if (this.isSelectionMode) {
				const selectionControls = card.createDiv({
					cls: "twofa-entry-card__selection-controls",
				});
				const manageIndicator = selectionControls.createDiv({
					cls: "twofa-entry-card__selection-indicator",
				});
				manageIndicator.setText(isSelected ? "✓" : "");
				selectionControls.createDiv({
					cls: "twofa-entry-card__drag-handle",
					text: "⋮⋮",
				});
			}

			const header = card.createDiv({
				cls: "twofa-entry-card__header",
			});
			const identity = header.createDiv({
				cls: "twofa-entry-card__identity",
			});
			const providerIcon = identity.createDiv({
				cls: "twofa-entry-card__provider-icon",
			});
			providerIcon.setAttribute("aria-hidden", "true");
			setIcon(providerIcon, resolveProviderIcon(entry));

			const titleBlock = identity.createDiv({
				cls: "twofa-entry-card__title-block",
			});
			const titleRow = titleBlock.createDiv({
				cls: "twofa-entry-card__title-row",
			});
			titleRow.createEl("div", {
				cls: "twofa-entry-card__title",
				text: entry.issuer || entry.accountName,
			});
			if (entry.issuer) {
				titleBlock.createEl("div", {
					cls: "twofa-entry-card__subtitle",
					text: entry.accountName,
				});
			}

			const codeRow = card.createDiv({
				cls: "twofa-entry-card__code-row",
			});
			const codeGroup = codeRow.createDiv({
				cls: "twofa-entry-card__code-group",
			});
			const codeEl = codeGroup.createEl("code", {
				cls: "twofa-entry-card__code",
			});
			this.renderStaticCode(codeEl, "------");
			let nextCodeEl: HTMLElement | null = null;
			if (showUpcomingCodes) {
				nextCodeEl = codeGroup.createEl("code", {
					cls: "twofa-entry-card__next-code-pill",
				});
				this.renderStaticCode(nextCodeEl, "------");
			}
			const countdownBadgeEl = codeRow.createDiv({
				cls: "twofa-entry-card__countdown-badge",
			});
			countdownBadgeEl.setAttribute(
				"aria-label",
				this.plugin.t("view.entry.countdown", {
					seconds: 0,
				}),
			);
			const countdownEl = countdownBadgeEl.createDiv({
				cls: "twofa-entry-card__countdown",
				text: "...",
			});

			this.rowRefs.set(entry.id, {
				cardEl: card,
				codeEl,
				countdownBadgeEl,
				countdownEl,
				nextCodeEl,
				previousCurrentCode: null,
				codeAnimationTimeoutId: null,
				codeAnimationToken: 0,
			});
		}

		this.syncDragStateClasses();
	}

	private renderSummaryBar(): void {
		const summaryBar = this.contentEl.createDiv({
			cls: "twofa-summary-bar",
		});

		if (!this.isSelectionMode) {
			summaryBar.createDiv({
				cls: "twofa-summary-bar__summary",
				text:
					this.visibleEntries.length === 1
						? this.plugin.t("view.summary.one", {
							count: this.visibleEntries.length,
						})
						: this.plugin.t("view.summary.other", {
							count: this.visibleEntries.length,
						}),
			});
			return;
		}

		summaryBar.addClass("is-selection-mode");
		const selectedCount = this.selectedEntryIds.size;
		summaryBar.createDiv({
			cls: "twofa-summary-bar__summary",
			text:
				selectedCount > 0
					? this.plugin.t("view.manage.selectedCount", {
						count: selectedCount,
					})
					: this.plugin.t("view.manage.emptySelection"),
		});
		const actions = summaryBar.createDiv({
			cls: "twofa-inline-actions",
		});
		const selectAllButton = actions.createEl("button", {
			text: this.plugin.t("common.selectAll"),
		});
		selectAllButton.addEventListener("click", () => {
			this.selectAllVisibleEntries();
		});

		if (selectedCount === 1) {
			const editButton = actions.createEl("button", {
				text: this.plugin.t("common.edit"),
			});
			editButton.addEventListener("click", () => {
				void this.editSelectedEntry();
			});
		}

		const deleteButton = actions.createEl("button", {
			text: this.plugin.t("common.deleteSelected"),
		});
		deleteButton.addClass("mod-warning");
		deleteButton.disabled = selectedCount === 0;
		deleteButton.addEventListener("click", () => {
			void this.deleteSelectedEntries();
		});

		const doneButton = actions.createEl("button", {
			text: this.plugin.t("common.done"),
		});
		doneButton.addClass("mod-cta");
		doneButton.addEventListener("click", () => {
			this.exitSelectionMode();
		});
	}

	private async handleCardClick(
		entry: TotpEntryRecord,
		event: MouseEvent,
	): Promise<void> {
		if (this.consumeSuppressedClick(entry.id)) {
			return;
		}

		if (this.isSelectionMode) {
			this.toggleEntrySelection(entry.id);
			return;
		}

		if (!shouldCopyCodeFromCardClick(event)) {
			return;
		}

		await this.copyEntryCode(entry);
	}

	private async handleCardKeyDown(
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: KeyboardEvent,
	): Promise<void> {
		if (event.key === "Escape" && this.isSelectionMode) {
			event.preventDefault();
			this.exitSelectionMode();
			return;
		}

		if (
			this.isSelectionMode &&
			(event.key === "Delete" || event.key === "Backspace")
		) {
			event.preventDefault();
			await this.deleteSelectedEntries();
			return;
		}

		const action = getCardKeyboardAction(event);

		if (this.isSelectionMode) {
			if (action === "copy") {
				event.preventDefault();
				this.toggleEntrySelection(entry.id);
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

	private handleCardPointerDown(entry: TotpEntryRecord, event: PointerEvent): void {
		if (this.isSelectionMode || !shouldStartCardLongPress(event)) {
			return;
		}

		this.clearLongPressState();
		this.longPressPointerId = event.pointerId;
		this.longPressStartX = event.clientX;
		this.longPressStartY = event.clientY;
		this.longPressTimer = window.setTimeout(() => {
			this.longPressTimer = null;
			this.enterSelectionMode(entry.id);
		}, LONG_PRESS_DELAY_MS);
	}

	private handleCardPointerMove(event: PointerEvent): void {
		if (this.longPressPointerId !== event.pointerId) {
			return;
		}

		const deltaX = event.clientX - this.longPressStartX;
		const deltaY = event.clientY - this.longPressStartY;

		if (Math.hypot(deltaX, deltaY) > LONG_PRESS_MOVE_THRESHOLD_PX) {
			this.clearLongPressState();
		}
	}

	private handleCardDragStart(entry: TotpEntryRecord, event: DragEvent): void {
		this.clearLongPressState();

		if (!this.isSelectionMode) {
			event.preventDefault();
			return;
		}

		const movedIds = this.selectedEntryIds.has(entry.id)
			? this.getSelectedVisibleEntryIds()
			: [entry.id];

		this.dragState = {
			movedIds,
			overEntryId: null,
			placement: "before",
		};
		event.dataTransfer?.setData("text/plain", movedIds.join("\n"));
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = "move";
		}
		this.syncDragStateClasses();
	}

	private handleCardDragOver(
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: DragEvent,
	): void {
		if (!this.dragState) {
			return;
		}

		event.preventDefault();
		if (this.dragState.movedIds.includes(entry.id)) {
			return;
		}

		const placement = this.getDropPlacement(card, event.clientY);
		if (
			this.dragState.overEntryId === entry.id &&
			this.dragState.placement === placement
		) {
			return;
		}

		this.dragState = {
			...this.dragState,
			overEntryId: entry.id,
			placement,
		};
		this.syncDragStateClasses();
	}

	private async handleCardDrop(
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: DragEvent,
	): Promise<void> {
		if (!this.dragState) {
			return;
		}

		event.preventDefault();
		if (this.dragState.movedIds.includes(entry.id)) {
			this.clearDragState();
			return;
		}

		const placement = this.getDropPlacement(card, event.clientY);
		const movedIds = [...this.dragState.movedIds];
		const nextOrderedIds = reorderVisibleEntries(
			this.plugin.getEntries(),
			this.visibleEntries.map((visibleEntry) => visibleEntry.id),
			movedIds,
			entry.id,
			placement,
		);
		const didChange = nextOrderedIds.some(
			(entryId, index) => entryId !== this.plugin.getEntries()[index]?.id,
		);

		this.clearDragState();

		if (!didChange) {
			return;
		}

		this.selectedEntryIds = new Set(movedIds);
		await this.plugin.reorderEntriesByIds(nextOrderedIds);
	}

	private getDropPlacement(card: HTMLElement, clientY: number): EntryDropPlacement {
		const { height, top } = card.getBoundingClientRect();
		return clientY >= top + height / 2 ? "after" : "before";
	}

	private syncDragStateClasses(): void {
		for (const [entryId, refs] of this.rowRefs) {
			const isDragging = this.dragState?.movedIds.includes(entryId) ?? false;
			const isDropTarget = this.dragState?.overEntryId === entryId && !isDragging;
			refs.cardEl.toggleClass("is-dragging", isDragging);
			refs.cardEl.toggleClass("is-drop-before", isDropTarget && this.dragState?.placement === "before");
			refs.cardEl.toggleClass("is-drop-after", isDropTarget && this.dragState?.placement === "after");
		}
	}

	private clearDragState(): void {
		this.dragState = null;
		for (const refs of this.rowRefs.values()) {
			refs.cardEl.removeClass("is-dragging");
			refs.cardEl.removeClass("is-drop-before");
			refs.cardEl.removeClass("is-drop-after");
		}
	}

	private enterSelectionMode(entryId: string): void {
		this.isSelectionMode = true;
		this.selectedEntryIds = new Set([entryId]);
		this.suppressedClickEntryId = entryId;
		this.clearLongPressState();
		void this.refresh();
	}

	private exitSelectionMode(): void {
		this.isSelectionMode = false;
		this.selectedEntryIds.clear();
		this.clearLongPressState();
		this.clearDragState();
		void this.refresh();
	}

	private resetSelectionState(): void {
		this.isSelectionMode = false;
		this.selectedEntryIds.clear();
		this.clearLongPressState();
		this.clearDragState();
		this.suppressedClickEntryId = null;
	}

	private toggleEntrySelection(entryId: string): void {
		const nextSelection = new Set(this.selectedEntryIds);

		if (nextSelection.has(entryId)) {
			nextSelection.delete(entryId);
		} else {
			nextSelection.add(entryId);
		}

		this.selectedEntryIds = nextSelection;
		void this.refresh();
	}

	private selectAllVisibleEntries(): void {
		this.selectedEntryIds = new Set(this.visibleEntries.map((entry) => entry.id));
		void this.refresh();
	}

	private async deleteSelectedEntries(): Promise<void> {
		if (this.selectedEntryIds.size === 0) {
			return;
		}

		const selectedIdSet = new Set(this.selectedEntryIds);
		const selectedEntries = this.plugin
			.getEntries()
			.filter((entry) => selectedIdSet.has(entry.id));
		const didDelete = await this.plugin.confirmAndDeleteEntries(selectedEntries);

		if (!didDelete) {
			return;
		}

		for (const entry of selectedEntries) {
			this.selectedEntryIds.delete(entry.id);
		}

		if (this.plugin.getEntries().length === 0) {
			this.isSelectionMode = false;
		}
	}

	private async editSelectedEntry(): Promise<void> {
		if (this.selectedEntryIds.size !== 1) {
			return;
		}

		const [selectedEntryId] = [...this.selectedEntryIds];
		const entryToEdit = this.plugin
			.getEntries()
			.find((entry) => entry.id === selectedEntryId);

		if (!entryToEdit) {
			return;
		}

		const didEdit = await this.plugin.promptToEditEntry(entryToEdit);

		if (didEdit) {
			this.exitSelectionMode();
		}
	}

	private getSelectedVisibleEntryIds(): string[] {
		return this.visibleEntries
			.filter((entry) => this.selectedEntryIds.has(entry.id))
			.map((entry) => entry.id);
	}

	private pruneSelectionToExistingEntries(entries: readonly TotpEntryRecord[]): void {
		const existingIds = new Set(entries.map((entry) => entry.id));
		this.selectedEntryIds = new Set(
			[...this.selectedEntryIds].filter((entryId) => existingIds.has(entryId)),
		);
	}

	private consumeSuppressedClick(entryId: string): boolean {
		if (this.suppressedClickEntryId !== entryId) {
			return false;
		}

		this.suppressedClickEntryId = null;
		return true;
	}

	private clearLongPressState(): void {
		if (this.longPressTimer !== null) {
			window.clearTimeout(this.longPressTimer);
			this.longPressTimer = null;
		}

		this.longPressPointerId = null;
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

	private async refreshVisibleCodes(): Promise<void> {
		if (!this.plugin.isUnlocked() || this.visibleEntries.length === 0) {
			return;
		}

		const currentRun = this.refreshRun + 1;
		this.refreshRun = currentRun;
		const snapshots = await Promise.all(
			this.visibleEntries.map(async (entry) => {
				try {
					return {
						entryId: entry.id,
						snapshot: await createTotpDisplaySnapshot(entry),
						error: null,
					};
				} catch (error) {
					return {
						entryId: entry.id,
						snapshot: null,
						error: this.plugin.getErrorMessage(error),
					};
				}
			}),
		);

		if (currentRun !== this.refreshRun) {
			return;
		}

		for (const result of snapshots) {
			const refs = this.rowRefs.get(result.entryId);
			if (!refs) {
				continue;
			}

			if (result.snapshot) {
				const transitionPlan = getCodeTransitionPlan({
					previousCurrentCode: refs.previousCurrentCode,
					nextCurrentCode: result.snapshot.currentCode,
					reducedMotion: this.shouldReduceMotion(),
				});

				this.updateCurrentCodeDisplay(
					refs,
					result.snapshot.currentCode,
					transitionPlan.currentAnimationMode,
				);
				refs.codeEl.removeClass("is-error");
				refs.countdownEl.setText(String(result.snapshot.secondsRemaining));
				refs.countdownBadgeEl.setAttribute(
					"aria-label",
					this.plugin.t("view.entry.countdown", {
						seconds: result.snapshot.secondsRemaining,
					}),
				);
				refs.countdownBadgeEl.style.setProperty(
					"--countdown-progress",
					`${result.snapshot.progressPercent.toFixed(2)}%`,
				);
				refs.countdownBadgeEl.removeClass("is-error");
				refs.countdownBadgeEl.toggleClass(
					"is-warning",
					result.snapshot.isRefreshingSoon,
				);
				if (refs.nextCodeEl) {
					this.renderStaticCode(refs.nextCodeEl, result.snapshot.nextCode);
				}
				refs.previousCurrentCode = result.snapshot.currentCode;
				continue;
			}

			this.setCurrentCodeText(refs, this.plugin.t("view.entry.error"));
			refs.codeEl.addClass("is-error");
			refs.countdownEl.setText("!");
			refs.countdownBadgeEl.style.setProperty("--countdown-progress", "0%");
			refs.countdownBadgeEl.removeClass("is-warning");
			refs.countdownBadgeEl.addClass("is-error");
			refs.countdownBadgeEl.setAttribute(
				"aria-label",
				result.error ?? this.plugin.t("view.entry.refreshFallback"),
			);
			if (refs.nextCodeEl) {
				this.renderStaticCode(refs.nextCodeEl, "------");
			}
			refs.previousCurrentCode = null;
		}
	}

	private shouldReduceMotion(): boolean {
		return (
			typeof window !== "undefined" &&
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		);
	}

	private updateCurrentCodeDisplay(
		refs: EntryRowRefs,
		nextCode: string,
		animationMode: CodeAnimationMode,
	): void {
		if (
			refs.previousCurrentCode === nextCode &&
			refs.codeAnimationTimeoutId === null
		) {
			return;
		}

		if (
			animationMode === "none" ||
			refs.previousCurrentCode === null ||
			refs.previousCurrentCode === nextCode
		) {
			this.setCurrentCodeText(refs, nextCode);
			return;
		}

		this.startCodeTransition(
			refs,
			refs.previousCurrentCode,
			nextCode,
			animationMode,
		);
	}

	private setCurrentCodeText(refs: EntryRowRefs, value: string): void {
		this.cancelCodeTransition(refs);
		this.renderStaticCode(refs.codeEl, value);
	}

	private startCodeTransition(
		refs: EntryRowRefs,
		previousCode: string,
		nextCode: string,
		animationMode: Exclude<CodeAnimationMode, "none">,
	): void {
		this.cancelCodeTransition(refs);
		const animationToken = refs.codeAnimationToken;
		refs.codeEl.empty();
		const transitionEl = refs.codeEl.createSpan({
			cls: `twofa-code-transition twofa-code-transition--${animationMode}`,
		});
		transitionEl.createSpan({
			cls: "twofa-code-transition__layer twofa-code-transition__layer--old",
			text: previousCode,
		});
		transitionEl.createSpan({
			cls: "twofa-code-transition__layer twofa-code-transition__layer--new",
			text: nextCode,
		});

		const animationDurationMs =
			animationMode === "fade"
				? CODE_TRANSITION_FADE_DURATION_MS
				: CODE_TRANSITION_SLIDE_DURATION_MS;
		refs.codeAnimationTimeoutId = window.setTimeout(() => {
			if (refs.codeAnimationToken !== animationToken) {
				return;
			}

			refs.codeAnimationTimeoutId = null;
			this.renderStaticCode(refs.codeEl, nextCode);
		}, animationDurationMs);
	}

	private cancelCodeTransition(refs: EntryRowRefs): void {
		refs.codeAnimationToken += 1;
		if (refs.codeAnimationTimeoutId !== null) {
			window.clearTimeout(refs.codeAnimationTimeoutId);
			refs.codeAnimationTimeoutId = null;
		}
	}

	private clearCodeTransitions(): void {
		for (const refs of this.rowRefs.values()) {
			this.cancelCodeTransition(refs);
		}
	}

	private renderStaticCode(containerEl: HTMLElement, value: string): void {
		containerEl.empty();
		containerEl.setText(value);
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
