import { setIcon } from "obsidian";
import type TwoFactorManagementPlugin from "../../plugin";
import type { TotpEntryRecord } from "../../types";
import { TotpManagerEntryCardRenderer } from "./totp-manager-entry-card-renderer";
import type { TotpCodeRefreshController } from "./totp-manager-view-code-refresh";
import type { TotpManagerViewState } from "./totp-manager-view-state";

export interface TotpManagerViewRendererActions {
	onAddEntry: () => void;
	onBulkImport: () => void;
	onOpenAddMenu: (target: HTMLElement) => void;
	onCardClick: (entry: TotpEntryRecord, event: MouseEvent) => void;
	onCardContextMenu: (entry: TotpEntryRecord, event: MouseEvent) => void;
	onCardDragHandlePointerDown: (
		entry: TotpEntryRecord,
		event: PointerEvent,
	) => void;
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
	showFloatingLockButton: boolean;
}

export interface TotpManagerViewRendererDependencies {
	entryCardRenderer?: TotpManagerEntryCardRenderer;
	setUiIcon?: (element: HTMLElement, icon: string) => void;
}

type ViewAvailabilityState = "locked" | "ready" | "uninitialized";

export class TotpManagerViewRenderer {
	private readonly entryCardRenderer: TotpManagerEntryCardRenderer;
	private readonly setUiIcon: (element: HTMLElement, icon: string) => void;

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

	render(contentEl: HTMLElement, context: TotpManagerViewRenderContext): void {
		this.codeRefresh.resetRows();
		contentEl.empty();
		contentEl.addClass("twofa-view");

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

		this.renderCommandDock(contentEl, availability);

		const body = contentEl.createDiv({
			cls: "twofa-view__body",
		});

		if (availability === "uninitialized") {
			this.renderUninitializedState(body);
			return;
		}

		if (availability === "locked") {
			this.renderLockedState(body);
			return;
		}

		this.renderUnlockedState(body, context.showUpcomingCodes);

		if (shouldRenderFloatingLock) {
			this.renderFloatingLockButton(contentEl);
		}

		this.codeRefresh.syncDragState(this.state.getDragState());
	}

	private getAvailabilityState(
		context: TotpManagerViewRenderContext,
	): ViewAvailabilityState {
		if (!context.isVaultInitialized) {
			return "uninitialized";
		}

		if (!context.isUnlocked) {
			return "locked";
		}

		return "ready";
	}

	private renderCommandDock(
		contentEl: HTMLElement,
		availability: ViewAvailabilityState,
	): void {
		const dock = contentEl.createDiv({
			cls: "twofa-command-dock",
		});
		dock.toggleClass("is-selection-mode", this.state.isSelectionMode());
		dock.toggleClass("is-unavailable", availability !== "ready");

		const topRow = dock.createDiv({
			cls: "twofa-command-dock__row twofa-command-dock__row--top",
		});
		const titleCluster = topRow.createDiv({
			cls: "twofa-command-dock__title-cluster",
		});
		titleCluster.createDiv({
			cls: "twofa-command-dock__status",
			text: this.getDockStatusText(availability),
		});

		const actions = topRow.createDiv({
			cls: "twofa-command-dock__actions",
		});

		if (this.state.isSelectionMode()) {
			this.renderSelectionActions(actions);
		} else {
			this.renderPrimaryActions(actions, availability === "ready");
		}

		const bottomRow = dock.createDiv({
			cls: "twofa-command-dock__row twofa-command-dock__row--bottom",
		});

		this.renderSearchField(bottomRow, availability === "ready");
	}

	private getDockStatusText(availability: ViewAvailabilityState): string {
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

	private renderSearchField(containerEl: HTMLElement, isInteractive: boolean): void {
		const searchShell = containerEl.createDiv({
			cls: "twofa-search-shell",
		});
		const iconEl = searchShell.createSpan({
			cls: "twofa-search-shell__icon",
		});
		iconEl.setAttribute("aria-hidden", "true");
		this.setUiIcon(iconEl, "search");

		const searchInput = searchShell.createEl("input", {
			type: "search",
			placeholder: this.plugin.t("view.search.placeholder"),
		});
		searchInput.addClass("twofa-search-input");
		searchInput.disabled = !isInteractive;
		searchInput.value = this.state.getSearchQuery();
		searchInput.addEventListener("input", (event) => {
			this.actions.onSearchQueryChange((event.target as HTMLInputElement).value);
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
			this.entryCardRenderer.renderEntryCard(list, entry, showUpcomingCodes);
		}
	}

	private renderFloatingLockButton(contentEl: HTMLElement): void {
		this.createActionPillButton(contentEl, {
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
