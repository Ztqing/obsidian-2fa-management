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
		onOpenAddMenu: () => {
			events.push("open-add-menu");
		},
		onCardClick: (entry) => {
			events.push(`card-click:${entry.id}`);
		},
		onCardContextMenu: (entry) => {
			events.push(`card-menu:${entry.id}`);
		},
		onCardDragHandlePointerDown: (entry) => {
			events.push(`handle-pointer-down:${entry.id}`);
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
			setUiIcon: () => {},
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
		showFloatingLockButton: true,
		showUpcomingCodes: false,
	});

	assert.equal(harness.state.isSelectionMode(), false);
	assert.equal(harness.state.getDragState(), null);
	assert.ok(harness.root.findByClass("twofa-command-dock"));
	assert.ok(harness.root.findByClass("twofa-search-input"));
	assert.ok(harness.root.findByText("common.unlockVault"));

	harness.renderer.render(harness.root as unknown as HTMLElement, {
		entries: harness.entries,
		isUnlocked: false,
		isVaultInitialized: false,
		showFloatingLockButton: true,
		showUpcomingCodes: false,
	});

	assert.ok(harness.root.findByText("common.createVault"));
	assert.equal(harness.getResetRowsCalls(), 2);
});

test("TotpManagerViewRenderer forwards search changes and renders dock controls by selection state", () => {
	const harness = createRendererHarness();

	harness.renderer.render(harness.root as unknown as HTMLElement, {
		entries: harness.entries,
		isUnlocked: true,
		isVaultInitialized: true,
		showFloatingLockButton: true,
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
	assert.ok(harness.root.findByClass("twofa-floating-lock-button"));
	assert.equal(harness.root.findByText("view.title"), null);
	const addButton = findActionPill(harness.root, "common.addEntry");
	assert.ok(addButton);
	assert.ok(addButton.hasClass("twofa-action-pill--primary"));
	assert.ok(addButton.hasClass("twofa-action-pill--compact"));
	assert.equal(addButton.getAttribute("title"), "common.addEntry");
	const bulkImportButton = findActionPill(harness.root, "common.bulkImport");
	assert.ok(bulkImportButton);
	assert.ok(bulkImportButton.hasClass("twofa-action-pill--secondary"));
	assert.ok(bulkImportButton.hasClass("twofa-action-pill--compact"));
	assert.equal(bulkImportButton.getAttribute("title"), "common.bulkImport");
	const lockButton = findActionPill(harness.root, "common.lock");
	assert.ok(lockButton);
	assert.ok(lockButton.hasClass("twofa-floating-lock-button"));
	assert.equal(lockButton.hasClass("twofa-action-pill--compact"), false);
	assert.equal(harness.root.findByText("common.addEntry"), null);
	assert.equal(harness.root.findByText("common.bulkImport"), null);

	harness.state.enterSelectionMode(harness.entries[0].id);
	harness.renderer.render(harness.root as unknown as HTMLElement, {
		entries: harness.entries,
		isUnlocked: true,
		isVaultInitialized: true,
		showFloatingLockButton: true,
		showUpcomingCodes: false,
	});

	const selectionTexts = collectTextContent(harness.root);
	assert.ok(selectionTexts.includes('view.manage.selectedCount:{"count":1}'));
	const selectAllButton = findActionPill(harness.root, "common.selectAll");
	assert.ok(selectAllButton);
	assert.ok(selectAllButton.hasClass("twofa-action-pill--secondary"));
	assert.ok(selectAllButton.hasClass("twofa-action-pill--compact"));
	const deleteSelectedButton = findActionPill(
		harness.root,
		"common.deleteSelected",
	);
	assert.ok(deleteSelectedButton);
	assert.ok(deleteSelectedButton.hasClass("twofa-action-pill--danger"));
	assert.ok(deleteSelectedButton.hasClass("twofa-action-pill--compact"));
	assert.equal(deleteSelectedButton.disabled, false);
	const cancelButton = findActionPill(harness.root, "common.cancel");
	assert.ok(cancelButton);
	assert.ok(cancelButton.hasClass("twofa-action-pill--compact"));
	assert.equal(selectionTexts.includes("common.edit"), false);
	assert.ok(harness.root.findByClass("twofa-search-input"));
	assert.equal(harness.root.findByText("common.selectAll"), null);
	assert.equal(harness.root.findByText("common.deleteSelected"), null);
	assert.equal(harness.root.findByText("common.cancel"), null);

	harness.state.toggleEntrySelection(harness.entries[1].id);
	harness.renderer.render(harness.root as unknown as HTMLElement, {
		entries: harness.entries,
		isUnlocked: true,
		isVaultInitialized: true,
		showFloatingLockButton: true,
		showUpcomingCodes: false,
	});

	const multiSelectionTexts = collectTextContent(harness.root);
	assert.ok(multiSelectionTexts.includes('view.manage.selectedCount:{"count":2}'));
	const clearSelectionButton = findActionPill(
		harness.root,
		"common.clearVisibleSelection",
	);
	assert.ok(clearSelectionButton);
	assert.ok(clearSelectionButton.hasClass("twofa-action-pill--compact"));
	assert.equal(multiSelectionTexts.includes("common.edit"), false);
});

test("TotpManagerViewRenderer still renders entries when the floating lock button is hidden", () => {
	const harness = createRendererHarness();

	harness.renderer.render(harness.root as unknown as HTMLElement, {
		entries: harness.entries,
		isUnlocked: true,
		isVaultInitialized: true,
		showFloatingLockButton: false,
		showUpcomingCodes: false,
	});

	assert.ok(harness.root.findByClass("twofa-command-dock"));
	assert.ok(harness.root.findByClass("twofa-search-input"));
	assert.ok(harness.root.findByClass("twofa-entry-card"));
	assert.equal(harness.root.findByClass("twofa-floating-lock-button"), null);
});

test("FakeElement.addClass rejects a whitespace-delimited class token", () => {
	const element = new FakeElement("div");

	assert.throws(() => {
		element.addClass("alpha beta");
	}, /Invalid class token/);
});

test("TotpManagerViewRenderer renders entry cards with selection semantics and next-code rows", () => {
	const harness = createRendererHarness();
	harness.state.enterSelectionMode(harness.entries[0].id);

	harness.renderer.render(harness.root as unknown as HTMLElement, {
		entries: harness.entries,
		isUnlocked: true,
		isVaultInitialized: true,
		showFloatingLockButton: false,
		showUpcomingCodes: true,
	});

	const card = harness.root.findByClass("twofa-entry-card");
	assert.ok(card);
	assert.equal(card.draggable, false);
	assert.equal(card.getAttribute("role"), "checkbox");
	assert.equal(card.getAttribute("aria-checked"), "true");
	assert.equal(card.getAttribute("aria-label"), null);
	assert.ok(card.getAttribute("aria-labelledby"));
	assert.equal(card.findByClass("twofa-entry-card__drag-handle"), null);
	assert.equal(card.findByClass("twofa-entry-card__selection-indicator"), null);
	assert.ok(card.findByClass("twofa-entry-card__supporting-row"));
	assert.equal(harness.root.findByClass("twofa-floating-lock-button"), null);
	assert.equal(harness.registeredRows.length, 2);
	assert.ok(harness.registeredRows.every((row) => row.nextCodeEl !== null));
	assert.equal(harness.getDragStateCalls(), 1);
});
