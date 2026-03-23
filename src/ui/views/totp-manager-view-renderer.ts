import { setIcon } from "obsidian";
import type TwoFactorManagementPlugin from "../../plugin";
import type { TotpEntryRecord } from "../../types";
import { resolveProviderIcon } from "../provider-icons";
import {
	type EntryRowRefs,
	type TotpCodeRefreshController,
	renderStaticCode,
} from "./totp-manager-view-code-refresh";
import type { TotpManagerViewState } from "./totp-manager-view-state";

const CODE_PLACEHOLDER = "------";

export interface TotpManagerViewRendererActions {
	onAddEntry: () => void;
	onBulkImport: () => void;
	onCardClick: (entry: TotpEntryRecord, event: MouseEvent) => void;
	onCardContextMenu: (entry: TotpEntryRecord, event: MouseEvent) => void;
	onCardDragEnd: () => void;
	onCardDragOver: (
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: DragEvent,
	) => void;
	onCardDragStart: (entry: TotpEntryRecord, event: DragEvent) => void;
	onCardDrop: (
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: DragEvent,
	) => void;
	onCardKeyDown: (
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: KeyboardEvent,
	) => void;
	onCardPointerDown: (entry: TotpEntryRecord, event: PointerEvent) => void;
	onCardPointerEnd: () => void;
	onCardPointerMove: (event: PointerEvent) => void;
	onCreateVault: () => void;
	onDeleteSelected: () => void;
	onEditSelected: () => void;
	onExitSelectionMode: () => void;
	onLockVault: () => void;
	onSearchQueryChange: (query: string) => void;
	onSelectAllVisible: () => void;
	onUnlockVault: () => void;
}

export interface TotpManagerViewRenderContext {
	entries: readonly TotpEntryRecord[];
	isUnlocked: boolean;
	isVaultInitialized: boolean;
	showUpcomingCodes: boolean;
}

export class TotpManagerViewRenderer {
	constructor(
		private readonly plugin: Pick<TwoFactorManagementPlugin, "t">,
		private readonly state: TotpManagerViewState,
		private readonly codeRefresh: TotpCodeRefreshController,
		private readonly actions: TotpManagerViewRendererActions,
	) {}

	render(contentEl: HTMLElement, context: TotpManagerViewRenderContext): void {
		this.codeRefresh.resetRows();
		contentEl.empty();
		contentEl.addClass("twofa-view");

		if (!context.isVaultInitialized) {
			this.state.resetForUnavailableVault();
			this.renderUninitializedState(contentEl);
			return;
		}

		if (!context.isUnlocked) {
			this.state.resetForUnavailableVault();
			this.renderLockedState(contentEl);
			return;
		}

		this.state.syncEntries(context.entries);
		this.renderUnlockedState(contentEl, context.showUpcomingCodes);
		this.codeRefresh.syncDragState(this.state.getDragState());
	}

	private renderUninitializedState(contentEl: HTMLElement): void {
		const wrapper = contentEl.createDiv({
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
			this.actions.onCreateVault();
		});
	}

	private renderLockedState(contentEl: HTMLElement): void {
		const wrapper = contentEl.createDiv({
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
			this.actions.onUnlockVault();
		});
	}

	private renderUnlockedState(
		contentEl: HTMLElement,
		showUpcomingCodes: boolean,
	): void {
		const toolbar = contentEl.createDiv({
			cls: "twofa-toolbar",
		});
		const searchInput = toolbar.createEl("input", {
			type: "search",
			placeholder: this.plugin.t("view.search.placeholder"),
		});
		searchInput.addClass("twofa-search-input");
		searchInput.value = this.state.getSearchQuery();
		searchInput.addEventListener("input", (event) => {
			this.actions.onSearchQueryChange((event.target as HTMLInputElement).value);
		});

		const actionGroup = toolbar.createDiv({
			cls: "twofa-inline-actions",
		});
		const addButton = actionGroup.createEl("button", {
			text: this.plugin.t("common.addEntry"),
		});
		addButton.addClass("mod-cta");
		addButton.addEventListener("click", () => {
			this.actions.onAddEntry();
		});

		const importButton = actionGroup.createEl("button", {
			text: this.plugin.t("common.bulkImport"),
		});
		importButton.addEventListener("click", () => {
			this.actions.onBulkImport();
		});

		const lockButton = actionGroup.createEl("button", {
			text: this.plugin.t("common.lock"),
		});
		lockButton.addEventListener("click", () => {
			this.actions.onLockVault();
		});

		this.renderSummaryBar(contentEl);

		const visibleEntries = this.state.getVisibleEntries();

		if (visibleEntries.length === 0) {
			const emptyState = contentEl.createDiv({
				cls: "twofa-empty-state twofa-empty-state--compact",
			});
			emptyState.createEl("p", {
				text:
					this.state.getSearchQuery().trim().length > 0
						? this.plugin.t("view.empty.search")
						: this.plugin.t("view.empty.entries"),
			});
			return;
		}

		const list = contentEl.createDiv({
			cls: "twofa-entry-list",
		});

		for (const entry of visibleEntries) {
			this.renderEntryCard(list, entry, showUpcomingCodes);
		}
	}

	private renderSummaryBar(contentEl: HTMLElement): void {
		const summaryBar = contentEl.createDiv({
			cls: "twofa-summary-bar",
		});

		if (!this.state.isSelectionMode()) {
			const visibleEntryCount = this.state.getVisibleEntries().length;
			summaryBar.createDiv({
				cls: "twofa-summary-bar__summary",
				text:
					visibleEntryCount === 1
						? this.plugin.t("view.summary.one", {
							count: visibleEntryCount,
						})
						: this.plugin.t("view.summary.other", {
							count: visibleEntryCount,
						}),
			});
			return;
		}

		summaryBar.addClass("is-selection-mode");
		const selectedCount = this.state.getSelectedCount();
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
			this.actions.onSelectAllVisible();
		});

		if (selectedCount === 1) {
			const editButton = actions.createEl("button", {
				text: this.plugin.t("common.edit"),
			});
			editButton.addEventListener("click", () => {
				this.actions.onEditSelected();
			});
		}

		const deleteButton = actions.createEl("button", {
			text: this.plugin.t("common.deleteSelected"),
		});
		deleteButton.addClass("mod-warning");
		deleteButton.disabled = selectedCount === 0;
		deleteButton.addEventListener("click", () => {
			this.actions.onDeleteSelected();
		});

		const doneButton = actions.createEl("button", {
			text: this.plugin.t("common.done"),
		});
		doneButton.addClass("mod-cta");
		doneButton.addEventListener("click", () => {
			this.actions.onExitSelectionMode();
		});
	}

	private renderEntryCard(
		listEl: HTMLElement,
		entry: TotpEntryRecord,
		showUpcomingCodes: boolean,
	): void {
		const isSelected = this.state.isEntrySelected(entry.id);
		const card = listEl.createDiv({
			cls: "twofa-entry-card",
		});
		card.toggleClass("is-selected", isSelected);
		card.toggleClass("is-selection-mode", this.state.isSelectionMode());
		card.draggable = this.state.isSelectionMode();
		card.tabIndex = 0;
		card.setAttribute("role", this.state.isSelectionMode() ? "checkbox" : "button");
		if (this.state.isSelectionMode()) {
			card.setAttribute("aria-checked", String(isSelected));
		}
		card.setAttribute(
			"aria-label",
			this.plugin.t("view.entry.cardAriaLabel", {
				accountName: entry.accountName,
			}),
		);
		card.addEventListener("pointerdown", (event) => {
			this.actions.onCardPointerDown(entry, event);
		});
		card.addEventListener("pointermove", (event) => {
			this.actions.onCardPointerMove(event);
		});
		card.addEventListener("pointerup", () => {
			this.actions.onCardPointerEnd();
		});
		card.addEventListener("pointerleave", () => {
			this.actions.onCardPointerEnd();
		});
		card.addEventListener("pointercancel", () => {
			this.actions.onCardPointerEnd();
		});
		card.addEventListener("click", (event) => {
			this.actions.onCardClick(entry, event);
		});
		card.addEventListener("contextmenu", (event) => {
			this.actions.onCardContextMenu(entry, event);
		});
		card.addEventListener("keydown", (event) => {
			this.actions.onCardKeyDown(entry, card, event);
		});
		card.addEventListener("dragstart", (event) => {
			this.actions.onCardDragStart(entry, event);
		});
		card.addEventListener("dragover", (event) => {
			this.actions.onCardDragOver(entry, card, event);
		});
		card.addEventListener("drop", (event) => {
			this.actions.onCardDrop(entry, card, event);
		});
		card.addEventListener("dragend", () => {
			this.actions.onCardDragEnd();
		});

		if (this.state.isSelectionMode()) {
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
		renderStaticCode(codeEl, CODE_PLACEHOLDER);
		let nextCodeEl: HTMLElement | null = null;
		if (showUpcomingCodes) {
			nextCodeEl = codeGroup.createEl("code", {
				cls: "twofa-entry-card__next-code-pill",
			});
			renderStaticCode(nextCodeEl, CODE_PLACEHOLDER);
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

		const refs: EntryRowRefs = {
			cardEl: card,
			codeAnimationTimeoutId: null,
			codeAnimationToken: 0,
			codeEl,
			countdownBadgeEl,
			countdownEl,
			nextCodeEl,
			previousCurrentCode: null,
		};
		this.codeRefresh.registerRow(entry.id, refs);
	}
}
