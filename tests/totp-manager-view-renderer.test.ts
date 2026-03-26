import assert from "node:assert/strict";
import test from "node:test";
import { TotpManagerEntryCardRenderer } from "../src/ui/views/totp-manager-entry-card-renderer";
import {
	TotpManagerViewRenderer,
	type TotpManagerViewRendererActions,
	type TotpManagerViewRenderMode,
} from "../src/ui/views/totp-manager-view-renderer";
import { TotpManagerViewState } from "../src/ui/views/totp-manager-view-state";
import type { TotpEntryRecord } from "../src/types";
import { FakeElement, collectTextContent } from "./support/fake-dom";

function createEntry(id: string, overrides: Partial<TotpEntryRecord> = {}): TotpEntryRecord {
	return {
		accountName: `${id}@example.com`,
		algorithm: "SHA-1",
		digits: 6,
		id,
		issuer: `Issuer ${id}`,
		period: 30,
		secret: "JBSWY3DPEHPK3PXP",
		sortOrder: Number(id.replace(/\D+/g, "")) || 0,
		...overrides,
	};
}

function createActionsLog() {
	const events: string[] = [];
	const actions: TotpManagerViewRendererActions = {
		onAddEntry: () => {
			events.push("add");
		},
		onBulkImport: () => {
			events.push("bulk-import");
		},
		onCardClick: (entry) => {
			events.push(`card-click:${entry.id}`);
		},
		onCardContextMenu: (entry) => {
			events.push(`card-menu:${entry.id}`);
		},
		onCardKeyDown: (entry) => {
			events.push(`card-keydown:${entry.id}`);
		},
		onCardPointerDown: (entry) => {
			events.push(`pointer-down:${entry.id}`);
		},
		onCardPointerEnd: (entry) => {
			events.push(`pointer-end:${entry.id}`);
		},
		onCardPointerLeave: () => {
			events.push("pointer-leave");
		},
		onCardPointerCancel: () => {
			events.push("pointer-cancel");
		},
		onCardPointerMove: (entry) => {
			events.push(`pointer-move:${entry.id}`);
		},
		onClearVault: () => {
			events.push("clear-vault");
		},
		onCreateVault: () => {
			events.push("create-vault");
		},
		onDeleteSelected: () => {
			events.push("delete-selected");
		},
		onExitSelectionMode: () => {
			events.push("exit-selection");
		},
		onOpenMoreMenu: () => {
			events.push("open-more-menu");
		},
		onSearchQueryChange: (query) => {
			events.push(`search:${query}`);
		},
		onSelectAllVisible: () => {
			events.push("select-all");
		},
		onUnlockVault: () => {
			events.push("unlock-vault");
		},
	};

	return {
		actions,
		events,
	};
}

function createRendererHarness() {
	const state = new TotpManagerViewState();
	const entries = [createEntry("entry-1"), createEntry("entry-2")];
	const { actions, events } = createActionsLog();
	const uiIcons: string[] = [];
	const registeredRows: Array<{
		entryId: string;
		nextCodeEl: unknown;
		nextCodeRowEl: unknown;
	}> = [];
	let dragStateCalls = 0;
	let resetRowsCalls = 0;

	const entryCardRenderer = new TotpManagerEntryCardRenderer(
		{
			t: (key, variables = {}) =>
				Object.keys(variables).length === 0
					? key
					: `${key}:${JSON.stringify(variables)}`,
		},
		state,
		{
			registerRow: (entry, refs) => {
				registeredRows.push({
					entryId: entry.id,
					nextCodeEl: refs.nextCodeEl,
					nextCodeRowEl: refs.nextCodeRowEl,
				});
			},
		},
		actions,
		{
			resolveProviderIcon: () => "lucide-key-round",
			setProviderIcon: () => {},
		},
	);

	const renderer = new TotpManagerViewRenderer(
		{
			t: (key, variables = {}) =>
				Object.keys(variables).length === 0
					? key
					: `${key}:${JSON.stringify(variables)}`,
		},
		state,
		{
			registerRow: () => {},
			resetRows: () => {
				resetRowsCalls += 1;
			},
			syncDragState: () => {
				dragStateCalls += 1;
			},
		},
		actions,
		{
			entryCardRenderer,
			setUiIcon: (_element, icon) => {
				uiIcons.push(icon);
			},
		},
	);

	return {
		entries,
		events,
		registeredRows,
		renderer,
		root: new FakeElement("div"),
		state,
		getDragStateCalls: () => dragStateCalls,
		getResetRowsCalls: () => resetRowsCalls,
		getUiIcons: () => [...uiIcons],
	};
}

function collectElements(
	root: FakeElement,
	predicate: (element: FakeElement) => boolean,
): FakeElement[] {
	return [
		...(predicate(root) ? [root] : []),
		...root.children.flatMap((child) => collectElements(child, predicate)),
	];
}

function findActionPill(root: FakeElement, label: string): FakeElement | null {
	return (
		collectElements(
			root,
			(element) =>
				element.hasClass("twofa-action-pill") &&
				element.getAttribute("aria-label") === label,
		)[0] ?? null
	);
}

test("TotpManagerViewRenderer resets unavailable state and renders create/unlock shells", () => {
	const harness = createRendererHarness();
	harness.state.syncEntries(harness.entries);
	harness.state.enterSelectionMode(harness.entries[0].id);
	harness.state.beginDrag(harness.entries[0].id);

	harness.renderer.render(harness.root as unknown as HTMLElement, {
		entries: harness.entries,
		isUnlocked: false,
		isVaultInitialized: true,
		showUpcomingCodes: false,
		vaultLoadIssue: null,
	});

	assert.equal(harness.state.isSelectionMode(), false);
	assert.equal(harness.state.getDragState(), null);
	assert.ok(harness.root.findByClass("twofa-command-dock"));
	assert.equal(harness.root.findByClass("twofa-command-dock__title"), null);
	assert.ok(harness.root.findByClass("twofa-command-dock__meta")?.hasClass("is-status"));
	assert.ok(harness.root.findByClass("twofa-search-input"));
	const unlockButton = harness.root.findByText("common.unlockVault");
	assert.ok(unlockButton);
	assert.ok(unlockButton.hasClass("twofa-state-panel__action"));
	assert.ok(unlockButton.hasClass("mod-cta"));
	assert.ok(harness.root.findByClass("twofa-state-panel__body"));

	harness.renderer.render(harness.root as unknown as HTMLElement, {
		entries: harness.entries,
		isUnlocked: false,
		isVaultInitialized: false,
		showUpcomingCodes: false,
		vaultLoadIssue: null,
	});

	const createVaultButton = harness.root.findByText("common.createVault");
	assert.ok(createVaultButton);
	assert.ok(createVaultButton.hasClass("twofa-state-panel__action--primary"));
	assert.ok(createVaultButton.hasClass("mod-cta"));
	assert.equal(harness.getResetRowsCalls(), 2);
});

test("TotpManagerViewRenderer renders a repair shell when stored vault data is unreadable", () => {
	const harness = createRendererHarness();

	harness.renderer.render(harness.root as unknown as HTMLElement, {
		entries: harness.entries,
		isUnlocked: false,
		isVaultInitialized: false,
		showUpcomingCodes: false,
		vaultLoadIssue: "corrupted",
	});

	assert.ok(harness.root.findByText("view.loadError.title"));
	const clearButton = harness.root.findByText("common.clearVault");
	assert.ok(clearButton);
	assert.ok(clearButton.hasClass("twofa-state-panel__action--danger"));
	assert.ok(clearButton.hasClass("mod-warning"));
	clearButton.dispatch("click");
	assert.deepEqual(harness.events, ["clear-vault"]);
});

test("TotpManagerViewRenderer forwards search changes and renders dock controls by selection state", () => {
	const harness = createRendererHarness();

	harness.renderer.render(harness.root as unknown as HTMLElement, {
		entries: harness.entries,
		isUnlocked: true,
		isVaultInitialized: true,
		showUpcomingCodes: false,
		vaultLoadIssue: null,
	});

	const searchInput = harness.root.findByClass("twofa-search-input");
	assert.ok(searchInput);
	assert.ok(searchInput.hasClass("search-input"));
	assert.ok(searchInput.parentElement?.hasClass("twofa-search-shell__inner"));
	assert.ok(searchInput.parentElement?.hasClass("search-input-container"));
	assert.equal(
		searchInput.parentElement?.parentElement?.hasClass("twofa-search-shell"),
		true,
	);
	searchInput.value = "issuer";
	searchInput.dispatch("input", {
		target: searchInput,
	});
	assert.deepEqual(harness.events, ["search:issuer"]);
	assert.ok(collectTextContent(harness.root).includes('view.meta.entries.other:{"count":2}'));
	assert.ok(harness.root.findByClass("twofa-command-dock__title-cluster"));
	assert.equal(harness.root.findByClass("twofa-command-dock__title"), null);
	assert.ok(harness.root.findByClass("twofa-command-dock__row--top"));
	assert.ok(harness.root.findByClass("twofa-command-dock__row--bottom"));
	assert.equal(
		searchInput.parentElement?.parentElement?.parentElement?.hasClass(
			"twofa-command-dock__row--top",
		),
		true,
	);
	assert.equal(
		harness.root.findByClass("twofa-command-dock__meta")?.parentElement?.parentElement?.hasClass(
			"twofa-command-dock__row--bottom",
		),
		true,
	);
	assert.equal(harness.root.findByText("view.title"), null);
	const addButton = findActionPill(harness.root, "common.addEntry");
	assert.ok(addButton);
	assert.ok(addButton.hasClass("twofa-action-pill--primary"));
	assert.ok(addButton.hasClass("twofa-action-pill--compact"));
	assert.ok(addButton.hasClass("twofa-action-pill--toolbar"));
	assert.ok(addButton.hasClass("clickable-icon"));
	assert.equal(addButton.getAttribute("title"), "common.addEntry");
	const moreButton = findActionPill(harness.root, "common.more");
	assert.ok(moreButton);
	assert.ok(moreButton.hasClass("twofa-action-pill--secondary"));
	assert.ok(moreButton.hasClass("twofa-action-pill--compact"));
	assert.ok(moreButton.hasClass("twofa-action-pill--toolbar"));
	assert.ok(moreButton.hasClass("clickable-icon"));
	assert.equal(moreButton.getAttribute("title"), "common.more");
	assert.ok(harness.getUiIcons().includes("plus"));
	assert.ok(harness.getUiIcons().includes("more-horizontal"));
	assert.ok(harness.getUiIcons().includes("search"));
	assert.equal(harness.root.findByClass("twofa-floating-lock-button"), null);
	assert.equal(harness.root.findByText("common.addEntry"), null);
	assert.equal(harness.root.findByText("common.more"), null);

	harness.state.enterSelectionMode(harness.entries[0].id);
	harness.renderer.render(
		harness.root as unknown as HTMLElement,
		{
			entries: harness.entries,
			isUnlocked: true,
			isVaultInitialized: true,
			showUpcomingCodes: false,
			vaultLoadIssue: null,
		},
		"body",
	);

	const selectionTexts = collectTextContent(harness.root);
	assert.ok(selectionTexts.includes('view.manage.selectedCount:{"count":1}'));
	const selectAllButton = findActionPill(harness.root, "common.selectAll");
	assert.ok(selectAllButton);
	assert.ok(selectAllButton.hasClass("twofa-action-pill--secondary"));
	assert.ok(selectAllButton.hasClass("twofa-action-pill--compact"));
	assert.ok(selectAllButton.hasClass("twofa-action-pill--toolbar"));
	assert.ok(selectAllButton.hasClass("clickable-icon"));
	const deleteSelectedButton = findActionPill(
		harness.root,
		"common.deleteSelected",
	);
	assert.ok(deleteSelectedButton);
	assert.ok(deleteSelectedButton.hasClass("twofa-action-pill--danger"));
	assert.ok(deleteSelectedButton.hasClass("twofa-action-pill--compact"));
	assert.ok(deleteSelectedButton.hasClass("twofa-action-pill--toolbar"));
	assert.ok(deleteSelectedButton.hasClass("clickable-icon"));
	assert.equal(deleteSelectedButton.disabled, false);
	const cancelButton = findActionPill(harness.root, "common.cancel");
	assert.ok(cancelButton);
	assert.ok(cancelButton.hasClass("twofa-action-pill--compact"));
	assert.ok(cancelButton.hasClass("twofa-action-pill--toolbar"));
	assert.ok(cancelButton.hasClass("clickable-icon"));
	assert.ok(harness.root.findByClass("twofa-search-input"));
	assert.equal(harness.root.findByText("common.selectAll"), null);
	assert.equal(harness.root.findByText("common.deleteSelected"), null);
	assert.equal(harness.root.findByText("common.cancel"), null);

	harness.state.toggleEntrySelection(harness.entries[1].id);
	harness.renderer.render(
		harness.root as unknown as HTMLElement,
		{
			entries: harness.entries,
			isUnlocked: true,
			isVaultInitialized: true,
			showUpcomingCodes: false,
			vaultLoadIssue: null,
		},
		"body",
	);

	const multiSelectionTexts = collectTextContent(harness.root);
	assert.ok(multiSelectionTexts.includes('view.manage.selectedCount:{"count":2}'));
	const clearSelectionButton = findActionPill(
		harness.root,
		"common.clearVisibleSelection",
	);
	assert.ok(clearSelectionButton);
	assert.ok(clearSelectionButton.hasClass("twofa-action-pill--compact"));
	assert.ok(clearSelectionButton.hasClass("twofa-action-pill--toolbar"));
	assert.ok(clearSelectionButton.hasClass("clickable-icon"));
	assert.equal(harness.getResetRowsCalls(), 1);
});

test("TotpManagerViewRenderer preserves the search input node across non-destructive refreshes", () => {
	const harness = createRendererHarness();
	const context = {
		entries: harness.entries,
		isUnlocked: true,
		isVaultInitialized: true,
		showUpcomingCodes: false,
		vaultLoadIssue: null,
	} satisfies Parameters<TotpManagerViewRenderer["render"]>[1];

	harness.renderer.render(harness.root as unknown as HTMLElement, context);

	const initialSearchInput = harness.root.findByClass("twofa-search-input");
	assert.ok(initialSearchInput);
	assert.ok(initialSearchInput.hasClass("search-input"));
	assert.ok(initialSearchInput.parentElement?.hasClass("twofa-search-shell__inner"));
	assert.ok(initialSearchInput.parentElement?.hasClass("search-input-container"));
	assert.equal(
		initialSearchInput.parentElement?.parentElement?.hasClass("twofa-search-shell"),
		true,
	);

	harness.state.setSearchQuery("issuer", harness.entries);
	harness.renderer.render(
		harness.root as unknown as HTMLElement,
		context,
		"search" satisfies TotpManagerViewRenderMode,
	);

	assert.equal(harness.root.findByClass("twofa-search-input"), initialSearchInput);
	assert.equal(harness.getResetRowsCalls(), 1);

	harness.state.enterSelectionMode(harness.entries[0].id);
	harness.renderer.render(
		harness.root as unknown as HTMLElement,
		context,
		"body",
	);

	assert.equal(harness.root.findByClass("twofa-search-input"), initialSearchInput);
	assert.equal(harness.getResetRowsCalls(), 1);

	harness.state.exitSelectionMode();
	harness.state.setSearchQuery("entry-1", harness.entries);
	harness.renderer.render(
		harness.root as unknown as HTMLElement,
		context,
		"search",
	);

	assert.equal(harness.root.findByClass("twofa-search-input"), initialSearchInput);
	assert.equal(harness.getResetRowsCalls(), 2);
	assert.ok(collectTextContent(harness.root).includes('view.meta.entries.one:{"count":1}'));
	assert.equal(collectElements(harness.root, (element) => element.hasClass("twofa-entry-card")).length, 1);
});

test("TotpManagerViewRenderer renders entries without legacy floating-lock UI", () => {
	const harness = createRendererHarness();

	harness.renderer.render(harness.root as unknown as HTMLElement, {
		entries: harness.entries,
		isUnlocked: true,
		isVaultInitialized: true,
		showUpcomingCodes: false,
		vaultLoadIssue: null,
	});

	assert.ok(harness.root.findByClass("twofa-command-dock"));
	assert.ok(harness.root.findByClass("twofa-search-input"));
	assert.ok(harness.root.findByClass("twofa-entry-card"));
	assert.equal(harness.root.findByClass("twofa-entry-card__next-code-row"), null);
	assert.equal(harness.root.findByClass("twofa-floating-lock-button"), null);
});

test("FakeElement.addClass rejects a whitespace-delimited class token", () => {
	const element = new FakeElement("div");

	assert.throws(() => {
		element.addClass("alpha beta");
	}, /Invalid class token/);
});

test("TotpManagerViewRenderer renders entry cards with selection semantics and persistent next-code panels", () => {
	const harness = createRendererHarness();
	harness.state.enterSelectionMode(harness.entries[0].id);

	harness.renderer.render(harness.root as unknown as HTMLElement, {
		entries: harness.entries,
		isUnlocked: true,
		isVaultInitialized: true,
		showUpcomingCodes: true,
		vaultLoadIssue: null,
	});

	const card = harness.root.findByClass("twofa-entry-card");
	assert.ok(card);
	assert.equal(card.draggable, false);
	assert.equal(card.getAttribute("role"), "checkbox");
	assert.equal(card.getAttribute("aria-checked"), "true");
	assert.equal(card.getAttribute("aria-label"), null);
	assert.ok(card.getAttribute("aria-labelledby"));
	assert.ok(card.findByClass("twofa-entry-card__title-block"));
	assert.ok(card.findByClass("twofa-entry-card__code-cluster"));
	assert.ok(card.findByClass("twofa-entry-card__status-rail"));
	assert.equal(
		card.findByClass("twofa-entry-card__status-rail")?.parentElement?.hasClass(
			"twofa-entry-card__header",
		),
		true,
	);
	const nextCodeRow = card.findByClass("twofa-entry-card__next-code-row");
	assert.ok(nextCodeRow);
	assert.equal(nextCodeRow?.getAttribute("aria-label"), "view.entry.nextCode");
	assert.equal(card.findByText("view.entry.nextCode"), null);
	assert.equal(harness.root.findByClass("twofa-floating-lock-button"), null);
	assert.equal(harness.registeredRows.length, 2);
	assert.ok(harness.registeredRows.every((row) => row.nextCodeEl !== null));
	assert.ok(harness.registeredRows.every((row) => row.nextCodeRowEl !== null));
	assert.equal(harness.getDragStateCalls(), 1);
});
