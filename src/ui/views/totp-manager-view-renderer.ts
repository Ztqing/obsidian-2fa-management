import { setIcon } from "obsidian";
import type TwoFactorManagementPlugin from "../../plugin";
import type { TotpEntryRecord, VaultLoadIssue } from "../../types";
import {
	type RenderedEntryCard,
	TotpManagerEntryCardRenderer,
} from "./totp-manager-entry-card-renderer";
import type { TotpCodeRefreshController } from "./totp-manager-view-code-refresh";
import type { TotpManagerViewState } from "./totp-manager-view-state";

export type TotpManagerViewRenderMode =
	| "availability"
	| "body"
	| "entries"
	| "full"
	| "search";

export interface TotpManagerViewRendererActions {
	onAddEntry: () => void;
	onBulkImport: () => void;
	onCardClick: (entry: TotpEntryRecord, card: HTMLElement, event: MouseEvent) => void;
	onCardContextMenu: (entry: TotpEntryRecord, event: MouseEvent) => void;
	onCardKeyDown: (
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: KeyboardEvent,
	) => void;
	onCardPointerDown: (entry: TotpEntryRecord, event: PointerEvent) => void;
	onCardPointerEnd: (
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: PointerEvent,
	) => void;
	onCardPointerLeave: (event: PointerEvent) => void;
	onCardPointerCancel: (event: PointerEvent) => void;
	onCardPointerMove: (
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: PointerEvent,
	) => void;
	onClearVault: () => void;
	onCreateVault: () => void;
	onDeleteSelected: () => void;
	onExitSelectionMode: () => void;
	onOpenMoreMenu: (target: HTMLElement) => void;
	onSearchQueryChange: (query: string) => void;
	onSelectAllVisible: () => void;
	onUnlockVault: () => void;
}

export interface TotpManagerViewRenderContext {
	entries: readonly TotpEntryRecord[];
	isUnlocked: boolean;
	isVaultInitialized: boolean;
	showUpcomingCodes: boolean;
	vaultLoadIssue: VaultLoadIssue | null;
}

export interface TotpManagerViewRendererDependencies {
	entryCardRenderer?: TotpManagerEntryCardRenderer;
	setUiIcon?: (element: HTMLElement, icon: string) => void;
}

type ViewAvailabilityState = "load-error" | "locked" | "ready" | "uninitialized";

export interface TotpManagerViewRenderResult {
	shouldRefreshVisibleCodes: boolean;
}

function appendChildElement(parentEl: HTMLElement, childEl: HTMLElement): void {
	const nextParent = parentEl as HTMLElement & {
		appendChild?: (child: HTMLElement) => void;
	};
	if (typeof nextParent.appendChild === "function") {
		nextParent.appendChild(childEl);
		return;
	}

	parentEl.append(childEl);
}

function removeElement(element: HTMLElement): void {
	const removable = element as HTMLElement & {
		remove?: () => void;
		parentElement?: {
			removeChild?: (child: HTMLElement) => void;
		} | null;
	};
	if (typeof removable.remove === "function") {
		removable.remove();
		return;
	}

	removable.parentElement?.removeChild?.(element);
}

export class TotpManagerViewRenderer {
	private readonly entryCardRenderer: TotpManagerEntryCardRenderer;
	private readonly setUiIcon: (element: HTMLElement, icon: string) => void;
	private contentEl: HTMLElement | null = null;
	private dockEl: HTMLElement | null = null;
	private dockMetaEl: HTMLElement | null = null;
	private dockActionsEl: HTMLElement | null = null;
	private bodyEl: HTMLElement | null = null;
	private entryListEl: HTMLElement | null = null;
	private searchInputEl: HTMLInputElement | null = null;
	private renderedAvailability: ViewAvailabilityState | null = null;
	private renderedVisibleEntryIds: string[] = [];
	private renderedShowUpcomingCodes: boolean | null = null;
	private readonly renderedCards = new Map<string, RenderedEntryCard>();

	constructor(
		private readonly plugin: Pick<TwoFactorManagementPlugin, "t">,
		private readonly state: TotpManagerViewState,
		private readonly codeRefresh: Pick<
			TotpCodeRefreshController,
			"resetRows" | "registerRow" | "syncDragState" | "unregisterRow"
		>,
		private readonly actions: TotpManagerViewRendererActions,
		dependencies: TotpManagerViewRendererDependencies = {},
		) {
		this.entryCardRenderer =
			dependencies.entryCardRenderer ??
			new TotpManagerEntryCardRenderer(
				this.plugin,
				this.state,
				this.codeRefresh,
				this.actions,
			);
		this.setUiIcon = dependencies.setUiIcon ?? setIcon;
	}

	render(
		contentEl: HTMLElement,
		context: TotpManagerViewRenderContext,
		mode: TotpManagerViewRenderMode = "full",
	): TotpManagerViewRenderResult {
		this.ensureLayout(contentEl);

		const availability = this.getAvailabilityState(context);

		if (availability !== "ready") {
			this.state.resetForUnavailableVault();
		} else {
			this.state.syncEntries(context.entries);
		}

		this.renderCommandDock(availability);

		const visibleEntries =
			availability === "ready" ? this.state.getVisibleEntries() : [];
		const visibleEntryIds = visibleEntries.map((entry) => entry.id);
		const shouldRebuildBody = this.shouldRebuildBody(
			availability,
			visibleEntries,
			context.showUpcomingCodes,
		);

		if (shouldRebuildBody) {
			this.codeRefresh.resetRows();
			this.renderBody(availability, visibleEntries, context.showUpcomingCodes);
		} else if (availability === "ready") {
			this.syncVisibleEntryCards(visibleEntries);
			this.syncVisibleCardSelectionState();
		}

		this.renderedAvailability = availability;
		this.renderedShowUpcomingCodes =
			availability === "ready" ? context.showUpcomingCodes : null;
		this.renderedVisibleEntryIds = visibleEntryIds;
		this.codeRefresh.syncDragState(availability === "ready" ? this.state.getDragState() : null);

		return {
			shouldRefreshVisibleCodes:
				availability === "ready" &&
				(mode === "availability" ||
					mode === "entries" ||
					mode === "full" ||
					(mode === "search" && shouldRebuildBody)),
		};
	}

	private getAvailabilityState(
		context: TotpManagerViewRenderContext,
	): ViewAvailabilityState {
		if (context.vaultLoadIssue !== null) {
			return "load-error";
		}

		if (!context.isVaultInitialized) {
			return "uninitialized";
		}

		if (!context.isUnlocked) {
			return "locked";
		}

		return "ready";
	}

	private renderCommandDock(availability: ViewAvailabilityState): void {
		this.dockEl?.toggleClass("is-selection-mode", this.state.isSelectionMode());
		this.dockEl?.toggleClass("is-unavailable", availability !== "ready");
		this.dockMetaEl?.setText(this.getDockMetaText(availability));
		this.dockMetaEl?.toggleClass(
			"is-status",
			availability !== "ready",
		);
		this.dockActionsEl?.empty();

		if (!this.dockActionsEl) {
			return;
		}

		if (this.state.isSelectionMode()) {
			this.renderSelectionActions(this.dockActionsEl);
		} else {
			this.renderPrimaryActions(this.dockActionsEl, availability === "ready");
		}
		if (this.searchInputEl) {
			this.searchInputEl.disabled = availability !== "ready";
			const nextQuery = this.state.getSearchQuery();
			if (this.searchInputEl.value !== nextQuery) {
				this.searchInputEl.value = nextQuery;
			}
		}
	}

	private getDockMetaText(availability: ViewAvailabilityState): string {
		if (availability === "load-error") {
			return this.plugin.t("view.loadError.title");
		}

		if (availability === "uninitialized") {
			return this.plugin.t("view.uninitialized.title");
		}

		if (availability === "locked") {
			return this.plugin.t("view.locked.title");
		}

		if (this.state.isSelectionMode()) {
			const selectedCount = this.state.getSelectedCount();
			return selectedCount > 0
				? this.plugin.t("view.manage.selectedCount", {
					count: selectedCount,
				})
				: this.plugin.t("view.manage.emptySelection");
		}

		const visibleEntryCount = this.state.getVisibleEntries().length;
		return visibleEntryCount === 1
			? this.plugin.t("view.meta.entries.one", {
				count: visibleEntryCount,
			})
			: this.plugin.t("view.meta.entries.other", {
				count: visibleEntryCount,
			});
	}

	private renderPrimaryActions(actionsEl: HTMLElement, isInteractive: boolean): void {
		this.createActionPillButton(actionsEl, {
			extraClasses: [
				"twofa-action-pill--compact",
				"twofa-action-pill--toolbar",
				"clickable-icon",
			],
			icon: "plus",
			isInteractive,
			label: this.plugin.t("common.addEntry"),
			onClick: () => {
				this.actions.onAddEntry();
			},
			variant: "primary",
		});
		let moreButton!: HTMLButtonElement;
		moreButton = this.createActionPillButton(actionsEl, {
			extraClasses: [
				"twofa-action-pill--compact",
				"twofa-action-pill--toolbar",
				"clickable-icon",
			],
			icon: "more-horizontal",
			isInteractive,
			label: this.plugin.t("common.more"),
			onClick: () => {
				this.actions.onOpenMoreMenu(moreButton);
			},
			variant: "secondary",
		});
	}

	private renderSelectionActions(actionsEl: HTMLElement): void {
		const selectedCount = this.state.getSelectedCount();
		const shouldClearVisibleSelection = this.state.areAllVisibleEntriesSelected();
		this.createActionPillButton(actionsEl, {
			extraClasses: [
				"twofa-action-pill--compact",
				"twofa-action-pill--toolbar",
				"clickable-icon",
			],
			icon: shouldClearVisibleSelection ? "square-x" : "check-check",
			isInteractive: this.state.getVisibleEntries().length > 0,
			label: shouldClearVisibleSelection
				? this.plugin.t("common.clearVisibleSelection")
				: this.plugin.t("common.selectAll"),
			onClick: () => {
				this.actions.onSelectAllVisible();
			},
			variant: "secondary",
		});
		this.createActionPillButton(actionsEl, {
			extraClasses: [
				"twofa-action-pill--compact",
				"twofa-action-pill--toolbar",
				"clickable-icon",
			],
			icon: "trash-2",
			isInteractive: selectedCount > 0,
			label: this.plugin.t("common.deleteSelected"),
			onClick: () => {
				this.actions.onDeleteSelected();
			},
			variant: "danger",
		});
		this.createActionPillButton(actionsEl, {
			extraClasses: [
				"twofa-action-pill--compact",
				"twofa-action-pill--toolbar",
				"clickable-icon",
			],
			icon: "x",
			isInteractive: true,
			label: this.plugin.t("common.cancel"),
			onClick: () => {
				this.actions.onExitSelectionMode();
			},
			variant: "secondary",
		});
	}

	private renderBody(
		availability: ViewAvailabilityState,
		visibleEntries: readonly TotpEntryRecord[],
		showUpcomingCodes: boolean,
	): void {
		if (!this.bodyEl) {
			return;
		}

		this.bodyEl.empty();
		this.renderedCards.clear();
		this.entryListEl = null;

		if (availability === "load-error") {
			this.renderLoadErrorState(this.bodyEl);
			return;
		}

		if (availability === "uninitialized") {
			this.renderUninitializedState(this.bodyEl);
			return;
		}

		if (availability === "locked") {
			this.renderLockedState(this.bodyEl);
			return;
		}

		this.renderUnlockedState(this.bodyEl, visibleEntries, showUpcomingCodes);
	}

	private renderLoadErrorState(contentEl: HTMLElement): void {
		this.renderStatePanel(contentEl, {
			description: this.plugin.t("view.loadError.description"),
			title: this.plugin.t("view.loadError.title"),
			actions: [
				{
					label: this.plugin.t("common.clearVault"),
					onClick: () => {
						this.actions.onClearVault();
					},
					variant: "danger",
				},
			],
		});
	}

	private renderUninitializedState(contentEl: HTMLElement): void {
		this.renderStatePanel(contentEl, {
			description: this.plugin.t("view.uninitialized.description"),
			title: this.plugin.t("view.uninitialized.title"),
			actions: [
				{
					label: this.plugin.t("common.createVault"),
					onClick: () => {
						this.actions.onCreateVault();
					},
					variant: "primary",
				},
			],
		});
	}

	private renderLockedState(contentEl: HTMLElement): void {
		this.renderStatePanel(contentEl, {
			description: this.plugin.t("view.locked.description"),
			title: this.plugin.t("view.locked.title"),
			actions: [
				{
					label: this.plugin.t("common.unlockVault"),
					onClick: () => {
						this.actions.onUnlockVault();
					},
					variant: "primary",
				},
			],
		});
	}

	private renderUnlockedState(
		contentEl: HTMLElement,
		visibleEntries: readonly TotpEntryRecord[],
		showUpcomingCodes: boolean,
	): void {
		if (visibleEntries.length === 0) {
			const emptyState = contentEl.createDiv({
				cls: "twofa-state-panel twofa-state-panel--compact",
			});
			emptyState.createEl("p", {
				cls: "twofa-state-panel__description",
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
		this.entryListEl = list;

		for (const entry of visibleEntries) {
			const renderedCard = this.entryCardRenderer.renderEntryCard(
				list,
				entry,
				showUpcomingCodes,
			);
			this.renderedCards.set(entry.id, renderedCard);
		}
	}

	private ensureLayout(contentEl: HTMLElement): void {
		if (this.contentEl === contentEl && this.dockEl && this.bodyEl && this.searchInputEl) {
			return;
		}

		this.contentEl = contentEl;
		this.contentEl.empty();
		this.contentEl.addClass("twofa-view");
		const shellEl = this.contentEl.createDiv({
			cls: "twofa-view__shell",
		});

		this.dockEl = shellEl.createDiv({
			cls: "twofa-command-dock",
		});
		const topRow = this.dockEl.createDiv({
			cls: "twofa-command-dock__row twofa-command-dock__row--top",
		});
		const searchShell = topRow.createDiv({
			cls: "twofa-search-shell",
		});
		const searchInner = searchShell.createDiv({
			cls: "twofa-search-shell__inner search-input-container",
		});
		const iconEl = searchInner.createSpan({
			cls: "twofa-search-shell__icon",
		});
		iconEl.setAttribute("aria-hidden", "true");
		this.setUiIcon(iconEl, "search");
		this.searchInputEl = searchInner.createEl("input", {
			type: "search",
			placeholder: this.plugin.t("view.search.placeholder"),
		});
		this.searchInputEl.addClass("twofa-search-input");
		this.searchInputEl.addClass("search-input");
		this.searchInputEl.addEventListener("input", (event) => {
			this.actions.onSearchQueryChange((event.target as HTMLInputElement).value);
		});
		this.dockActionsEl = topRow.createDiv({
			cls: "twofa-command-dock__actions",
		});
		const bottomRow = this.dockEl.createDiv({
			cls: "twofa-command-dock__row twofa-command-dock__row--bottom",
		});
		const metaCluster = bottomRow.createDiv({
			cls: "twofa-command-dock__title-cluster",
		});
		this.dockMetaEl = metaCluster.createDiv({
			cls: "twofa-command-dock__meta",
		});
		this.bodyEl = shellEl.createDiv({
			cls: "twofa-view__body",
		});
	}

	private renderStatePanel(
		contentEl: HTMLElement,
		options: {
			actions: Array<{
				label: string;
				onClick: () => void;
				variant: "danger" | "primary" | "secondary";
			}>;
			description: string;
			title: string;
		},
	): void {
		const wrapper = contentEl.createDiv({
			cls: "twofa-state-panel",
		});
		const body = wrapper.createDiv({
			cls: "twofa-state-panel__body",
		});
		body.createEl("h3", {
			cls: "twofa-state-panel__title",
			text: options.title,
		});
		body.createEl("p", {
			cls: "twofa-state-panel__description",
			text: options.description,
		});

		if (options.actions.length === 0) {
			return;
		}

		const actionsEl = wrapper.createDiv({
			cls: "twofa-inline-actions twofa-state-panel__actions",
		});
		for (const action of options.actions) {
			const button = actionsEl.createEl("button", {
				cls: [
					"twofa-state-panel__action",
					`twofa-state-panel__action--${action.variant}`,
					action.variant === "primary"
						? "mod-cta"
						: action.variant === "danger"
							? "mod-warning"
							: "",
				].join(" "),
				text: action.label,
			});
			button.type = "button";
			button.addEventListener("click", () => {
				action.onClick();
			});
		}
	}

	private shouldRebuildBody(
		availability: ViewAvailabilityState,
		visibleEntries: readonly TotpEntryRecord[],
		showUpcomingCodes: boolean,
	): boolean {
		if (this.renderedAvailability !== availability) {
			return true;
		}

		if (availability !== "ready") {
			return false;
		}

		if (this.renderedShowUpcomingCodes !== showUpcomingCodes) {
			return true;
		}

		const isCurrentlyRenderingList = this.entryListEl !== null;
		return (visibleEntries.length === 0) === isCurrentlyRenderingList;
	}

	private syncVisibleEntryCards(
		visibleEntries: readonly TotpEntryRecord[],
	): void {
		if (!this.entryListEl) {
			return;
		}

		const visibleEntryIds = new Set(visibleEntries.map((entry) => entry.id));
		for (const [entryId, renderedCard] of this.renderedCards) {
			if (visibleEntryIds.has(entryId)) {
				continue;
			}

			this.codeRefresh.unregisterRow(entryId);
			this.renderedCards.delete(entryId);
			removeElement(renderedCard.cardEl);
		}

		for (const entry of visibleEntries) {
			const existingCard = this.renderedCards.get(entry.id);
			if (existingCard) {
				this.entryCardRenderer.updateEntryCard(existingCard, entry);
				appendChildElement(this.entryListEl, existingCard.cardEl);
				continue;
			}

			const renderedCard = this.entryCardRenderer.renderEntryCard(
				this.entryListEl,
				entry,
				this.renderedShowUpcomingCodes ?? false,
			);
			this.renderedCards.set(entry.id, renderedCard);
			appendChildElement(this.entryListEl, renderedCard.cardEl);
		}
	}

	private syncVisibleCardSelectionState(): void {
		for (const entry of this.state.getVisibleEntries()) {
			const renderedCard = this.renderedCards.get(entry.id);
			if (!renderedCard) {
				continue;
			}

			this.entryCardRenderer.syncCardSelectionState(
				renderedCard.cardEl,
				entry.id,
			);
		}
	}

	private createActionPillButton(
		containerEl: HTMLElement,
		options: {
			extraClasses?: string[];
			icon: string;
			isInteractive: boolean;
			label: string;
			onClick: () => void;
			variant: "danger" | "primary" | "secondary";
		},
	): HTMLButtonElement {
		const button = containerEl.createEl("button", {
			cls: [
				"twofa-action-pill",
				`twofa-action-pill--${options.variant}`,
				...(options.extraClasses ?? []),
			].join(" "),
		});
		button.type = "button";
		button.disabled = !options.isInteractive;
		button.setAttribute("aria-label", options.label);
		button.setAttribute("title", options.label);

		const iconEl = button.createSpan({
			cls: "twofa-action-pill__icon",
		});
		iconEl.setAttribute("aria-hidden", "true");
		this.setUiIcon(iconEl, options.icon);

		button.addEventListener("click", () => {
			if (!options.isInteractive) {
				return;
			}

			options.onClick();
		});

		return button;
	}
}
