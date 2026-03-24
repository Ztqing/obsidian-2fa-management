import { setIcon } from "obsidian";
import type TwoFactorManagementPlugin from "../../plugin";
import type { TotpEntryRecord, VaultLoadIssue } from "../../types";
import { TotpManagerEntryCardRenderer } from "./totp-manager-entry-card-renderer";
import type { TotpCodeRefreshController } from "./totp-manager-view-code-refresh";
import type { TotpManagerViewState } from "./totp-manager-view-state";

export type TotpManagerViewRenderMode = "body" | "full" | "search";

export interface TotpManagerViewRendererActions {
	onAddEntry: () => void;
	onBulkImport: () => void;
	onCardClick: (entry: TotpEntryRecord, event: MouseEvent) => void;
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
	showFloatingLockButton: boolean;
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

export class TotpManagerViewRenderer {
	private readonly entryCardRenderer: TotpManagerEntryCardRenderer;
	private readonly setUiIcon: (element: HTMLElement, icon: string) => void;
	private contentEl: HTMLElement | null = null;
	private dockEl: HTMLElement | null = null;
	private dockStatusEl: HTMLElement | null = null;
	private dockActionsEl: HTMLElement | null = null;
	private bodyEl: HTMLElement | null = null;
	private searchInputEl: HTMLInputElement | null = null;
	private floatingLockContainerEl: HTMLElement | null = null;
	private renderedAvailability: ViewAvailabilityState | null = null;
	private renderedVisibleEntryIds: string[] = [];
	private readonly renderedCards = new Map<string, HTMLElement>();

	constructor(
		private readonly plugin: Pick<TwoFactorManagementPlugin, "t">,
		private readonly state: TotpManagerViewState,
		private readonly codeRefresh: Pick<
			TotpCodeRefreshController,
			"resetRows" | "registerRow" | "syncDragState"
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
		const shouldRenderFloatingLock =
			context.isVaultInitialized &&
			context.isUnlocked &&
			context.showFloatingLockButton;

		contentEl.toggleClass("has-floating-lock", shouldRenderFloatingLock);

		if (availability !== "ready") {
			this.state.resetForUnavailableVault();
		} else {
			this.state.syncEntries(context.entries);
		}

		this.renderCommandDock(availability);

		const visibleEntryIds =
			availability === "ready"
				? this.state.getVisibleEntries().map((entry) => entry.id)
				: [];
		const shouldRebuildBody = this.shouldRebuildBody(mode, availability, visibleEntryIds);

		if (shouldRebuildBody) {
			this.codeRefresh.resetRows();
			this.renderBody(availability, context.showUpcomingCodes);
		} else {
			this.syncVisibleCardSelectionState();
		}

		this.renderFloatingLockContainer(shouldRenderFloatingLock);
		this.renderedAvailability = availability;
		this.renderedVisibleEntryIds = visibleEntryIds;
		this.codeRefresh.syncDragState(availability === "ready" ? this.state.getDragState() : null);

		return {
			shouldRefreshVisibleCodes:
				availability === "ready" &&
				(mode === "full" || (mode === "search" && shouldRebuildBody)),
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
		this.dockStatusEl?.setText(this.getDockStatusText(availability));
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

	private getDockStatusText(availability: ViewAvailabilityState): string {
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
			? this.plugin.t("view.summary.one", {
				count: visibleEntryCount,
			})
			: this.plugin.t("view.summary.other", {
				count: visibleEntryCount,
			});
	}

	private renderPrimaryActions(actionsEl: HTMLElement, isInteractive: boolean): void {
		this.createActionPillButton(actionsEl, {
			extraClasses: ["twofa-action-pill--compact"],
			icon: "plus",
			isInteractive,
			label: this.plugin.t("common.addEntry"),
			onClick: () => {
				this.actions.onAddEntry();
			},
			variant: "primary",
		});
		this.createActionPillButton(actionsEl, {
			extraClasses: ["twofa-action-pill--compact"],
			icon: "import",
			isInteractive,
			label: this.plugin.t("common.bulkImport"),
			onClick: () => {
				this.actions.onBulkImport();
			},
			variant: "secondary",
		});
	}

	private renderSelectionActions(actionsEl: HTMLElement): void {
		const selectedCount = this.state.getSelectedCount();
		const shouldClearVisibleSelection = this.state.areAllVisibleEntriesSelected();
		this.createActionPillButton(actionsEl, {
			extraClasses: ["twofa-action-pill--compact"],
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
			extraClasses: ["twofa-action-pill--compact"],
			icon: "trash-2",
			isInteractive: selectedCount > 0,
			label: this.plugin.t("common.deleteSelected"),
			onClick: () => {
				this.actions.onDeleteSelected();
			},
			variant: "danger",
		});
		this.createActionPillButton(actionsEl, {
			extraClasses: ["twofa-action-pill--compact"],
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
		showUpcomingCodes: boolean,
	): void {
		if (!this.bodyEl) {
			return;
		}

		this.bodyEl.empty();
		this.renderedCards.clear();

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

		this.renderUnlockedState(this.bodyEl, showUpcomingCodes);
	}

	private renderLoadErrorState(contentEl: HTMLElement): void {
		const wrapper = contentEl.createDiv({
			cls: "twofa-state-panel",
		});
		wrapper.createEl("h3", {
			text: this.plugin.t("view.loadError.title"),
		});
		wrapper.createEl("p", {
			text: this.plugin.t("view.loadError.description"),
		});
		const actions = wrapper.createDiv({
			cls: "twofa-inline-actions",
		});
		const clearButton = actions.createEl("button", {
			cls: "mod-warning",
			text: this.plugin.t("common.clearVault"),
		});
		clearButton.addEventListener("click", () => {
			this.actions.onClearVault();
		});
	}

	private renderUninitializedState(contentEl: HTMLElement): void {
		const wrapper = contentEl.createDiv({
			cls: "twofa-state-panel",
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
			cls: "mod-cta",
			text: this.plugin.t("common.createVault"),
		});
		initializeButton.addEventListener("click", () => {
			this.actions.onCreateVault();
		});
	}

	private renderLockedState(contentEl: HTMLElement): void {
		const wrapper = contentEl.createDiv({
			cls: "twofa-state-panel",
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
			cls: "mod-cta",
			text: this.plugin.t("common.unlockVault"),
		});
		unlockButton.addEventListener("click", () => {
			this.actions.onUnlockVault();
		});
	}

	private renderUnlockedState(
		contentEl: HTMLElement,
		showUpcomingCodes: boolean,
	): void {
		const visibleEntries = this.state.getVisibleEntries();

		if (visibleEntries.length === 0) {
			const emptyState = contentEl.createDiv({
				cls: "twofa-state-panel twofa-state-panel--compact",
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
			const card = this.entryCardRenderer.renderEntryCard(list, entry, showUpcomingCodes);
			this.renderedCards.set(entry.id, card);
		}
	}

	private renderFloatingLockContainer(shouldRenderFloatingLock: boolean): void {
		this.floatingLockContainerEl?.empty();
		if (!this.floatingLockContainerEl || !shouldRenderFloatingLock) {
			return;
		}

		this.createActionPillButton(this.floatingLockContainerEl, {
			extraClasses: ["twofa-floating-lock-button"],
			icon: "lock",
			isInteractive: true,
			label: this.plugin.t("common.lock"),
			onClick: () => {
				this.actions.onLockVault();
			},
			variant: "secondary",
		});
	}

	private ensureLayout(contentEl: HTMLElement): void {
		if (this.contentEl === contentEl && this.dockEl && this.bodyEl && this.searchInputEl) {
			return;
		}

		this.contentEl = contentEl;
		this.contentEl.empty();
		this.contentEl.addClass("twofa-view");

		this.dockEl = this.contentEl.createDiv({
			cls: "twofa-command-dock",
		});
		const topRow = this.dockEl.createDiv({
			cls: "twofa-command-dock__row twofa-command-dock__row--top",
		});
		const titleCluster = topRow.createDiv({
			cls: "twofa-command-dock__title-cluster",
		});
		this.dockStatusEl = titleCluster.createDiv({
			cls: "twofa-command-dock__status",
		});
		this.dockActionsEl = topRow.createDiv({
			cls: "twofa-command-dock__actions",
		});
		const bottomRow = this.dockEl.createDiv({
			cls: "twofa-command-dock__row twofa-command-dock__row--bottom",
		});
		const searchShell = bottomRow.createDiv({
			cls: "twofa-search-shell",
		});
		const iconEl = searchShell.createSpan({
			cls: "twofa-search-shell__icon",
		});
		iconEl.setAttribute("aria-hidden", "true");
		this.setUiIcon(iconEl, "search");
		this.searchInputEl = searchShell.createEl("input", {
			type: "search",
			placeholder: this.plugin.t("view.search.placeholder"),
		});
		this.searchInputEl.addClass("twofa-search-input");
		this.searchInputEl.addEventListener("input", (event) => {
			this.actions.onSearchQueryChange((event.target as HTMLInputElement).value);
		});
		this.bodyEl = this.contentEl.createDiv({
			cls: "twofa-view__body",
		});
		this.floatingLockContainerEl = this.contentEl.createDiv();
	}

	private shouldRebuildBody(
		mode: TotpManagerViewRenderMode,
		availability: ViewAvailabilityState,
		visibleEntryIds: readonly string[],
	): boolean {
		if (this.renderedAvailability !== availability) {
			return true;
		}

		if (mode === "full") {
			return true;
		}

		if (availability !== "ready") {
			return true;
		}

		if (visibleEntryIds.length !== this.renderedVisibleEntryIds.length) {
			return true;
		}

		return visibleEntryIds.some((entryId, index) => entryId !== this.renderedVisibleEntryIds[index]);
	}

	private syncVisibleCardSelectionState(): void {
		for (const entry of this.state.getVisibleEntries()) {
			const card = this.renderedCards.get(entry.id);
			if (!card) {
				continue;
			}

			this.entryCardRenderer.syncCardSelectionState(card, entry.id);
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
