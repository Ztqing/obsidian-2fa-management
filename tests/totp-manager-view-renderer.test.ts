import assert from "node:assert/strict";
import test from "node:test";
import { TotpManagerEntryCardRenderer } from "../src/ui/views/totp-manager-entry-card-renderer";
import {
	TotpManagerViewRenderer,
	type TotpManagerViewRendererActions,
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
		onCardDragEnd: () => {
			events.push("drag-end");
		},
		onCardDragOver: (entry) => {
			events.push(`drag-over:${entry.id}`);
		},
		onCardDragStart: (entry) => {
			events.push(`drag-start:${entry.id}`);
		},
		onCardDrop: (entry) => {
			events.push(`drag-drop:${entry.id}`);
		},
		onCardKeyDown: (entry) => {
			events.push(`card-keydown:${entry.id}`);
		},
		onCardPointerDown: (entry) => {
			events.push(`pointer-down:${entry.id}`);
		},
		onCardPointerEnd: () => {
			events.push("pointer-end");
		},
		onCardPointerMove: () => {
			events.push("pointer-move");
		},
		onCreateVault: () => {
			events.push("create-vault");
		},
		onDeleteSelected: () => {
			events.push("delete-selected");
		},
		onEditSelected: () => {
			events.push("edit-selected");
		},
		onExitSelectionMode: () => {
			events.push("exit-selection");
		},
		onLockVault: () => {
			events.push("lock-vault");
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
	const registeredRows: Array<{
		entryId: string;
		nextCodeEl: unknown;
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
			registerRow: (entryId, refs) => {
				registeredRows.push({
					entryId,
					nextCodeEl: refs.nextCodeEl,
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
	};
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
	});

	assert.equal(harness.state.isSelectionMode(), false);
	assert.equal(harness.state.getDragState(), null);
	assert.ok(harness.root.findByText("common.unlockVault"));

	harness.renderer.render(harness.root as unknown as HTMLElement, {
		entries: harness.entries,
		isUnlocked: false,
		isVaultInitialized: false,
		showUpcomingCodes: false,
	});

	assert.ok(harness.root.findByText("common.createVault"));
	assert.equal(harness.getResetRowsCalls(), 2);
});

test("TotpManagerViewRenderer forwards search changes and renders summary controls by selection state", () => {
	const harness = createRendererHarness();

	harness.renderer.render(harness.root as unknown as HTMLElement, {
		entries: harness.entries,
		isUnlocked: true,
		isVaultInitialized: true,
		showUpcomingCodes: false,
	});

	const searchInput = harness.root.findByClass("twofa-search-input");
	assert.ok(searchInput);
	searchInput.value = "issuer";
	searchInput.dispatch("input", {
		target: searchInput,
	});
	assert.deepEqual(harness.events, ["search:issuer"]);
	assert.ok(collectTextContent(harness.root).includes('view.summary.other:{"count":2}'));

	harness.state.enterSelectionMode(harness.entries[0].id);
	harness.renderer.render(harness.root as unknown as HTMLElement, {
		entries: harness.entries,
		isUnlocked: true,
		isVaultInitialized: true,
		showUpcomingCodes: false,
	});

	const selectionTexts = collectTextContent(harness.root);
	assert.ok(selectionTexts.includes('view.manage.selectedCount:{"count":1}'));
	assert.ok(selectionTexts.includes("common.edit"));
	assert.ok(selectionTexts.includes("common.deleteSelected"));
	assert.ok(selectionTexts.includes("common.done"));

	harness.state.toggleEntrySelection(harness.entries[1].id);
	harness.renderer.render(harness.root as unknown as HTMLElement, {
		entries: harness.entries,
		isUnlocked: true,
		isVaultInitialized: true,
		showUpcomingCodes: false,
	});

	const multiSelectionTexts = collectTextContent(harness.root);
	assert.ok(multiSelectionTexts.includes('view.manage.selectedCount:{"count":2}'));
	assert.equal(multiSelectionTexts.includes("common.edit"), false);
});

test("TotpManagerViewRenderer renders entry cards with selection semantics and next-code rows", () => {
	const harness = createRendererHarness();
	harness.state.enterSelectionMode(harness.entries[0].id);

	harness.renderer.render(harness.root as unknown as HTMLElement, {
		entries: harness.entries,
		isUnlocked: true,
		isVaultInitialized: true,
		showUpcomingCodes: true,
	});

	const card = harness.root.findByClass("twofa-entry-card");
	assert.ok(card);
	assert.equal(card.draggable, true);
	assert.equal(card.getAttribute("role"), "checkbox");
	assert.equal(card.getAttribute("aria-checked"), "true");
	assert.ok(card.findByClass("twofa-entry-card__drag-handle"));
	assert.equal(harness.registeredRows.length, 2);
	assert.ok(harness.registeredRows.every((row) => row.nextCodeEl !== null));
	assert.equal(harness.getDragStateCalls(), 1);
});
