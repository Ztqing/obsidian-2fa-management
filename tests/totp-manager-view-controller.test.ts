import assert from "node:assert/strict";
import test from "node:test";
import { TotpManagerViewController } from "../src/ui/views/totp-manager-view-controller";
import { TotpManagerViewState } from "../src/ui/views/totp-manager-view-state";
import type {
	TotpCodeSnapshot,
	TotpEntryRecord,
	TranslationVariables,
} from "../src/types";
import { FakeElement } from "./support/fake-dom";

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

function createControllerHarness(options: {
	confirmDeleteResult?: boolean;
	editResult?: boolean;
} = {}) {
	const state = new TotpManagerViewState();
	const entries = [createEntry("entry-1"), createEntry("entry-2"), createEntry("entry-3")];
	const callLog: string[] = [];
	let nextDeleteResult = options.confirmDeleteResult ?? true;
	let nextEditResult = options.editResult ?? true;
	let latestMenu: {
		items: { click: (() => void) | null; icon: string; title: string }[];
		mouseEvent: MouseEvent | null;
		position:
			| {
					left?: boolean;
					width?: number;
					x: number;
					y: number;
			  }
			| null;
	} | null = null;

	const environment = {
		confirmAndDeleteEntries: async (selectedEntries: readonly TotpEntryRecord[]) => {
			callLog.push(
				`deleteEntries:${selectedEntries.map((entry) => entry.id).join(",")}`,
			);
			if (!nextDeleteResult) {
				return false;
			}
			const selectedIds = new Set(selectedEntries.map((entry) => entry.id));
			const nextEntries = entries.filter((entry) => !selectedIds.has(entry.id));
			entries.splice(0, entries.length, ...nextEntries);
			return true;
		},
		confirmAndDeleteEntry: async (entry: TotpEntryRecord) => {
			callLog.push(`deleteEntry:${entry.id}`);
			return true;
		},
		copyTextToClipboard: async (text: string) => {
			callLog.push(`copy:${text}`);
		},
		createMenu: () => {
			latestMenu = {
				items: [],
				mouseEvent: null,
				position: null,
			};
			const menu = {
				addItem: (callback: (item: {
					onClick(nextClick: () => void): {
						click: (() => void) | null;
						icon: string;
						onClick(nextClick: () => void): any;
						setIcon(icon: string): any;
						setTitle(title: string): any;
						title: string;
					};
					setIcon(icon: string): any;
					setTitle(title: string): any;
				}) => void) => {
					const menuItem = {
						click: null as (() => void) | null,
						icon: "",
						onClick(nextClick: () => void) {
							this.click = nextClick;
							return this;
						},
						setIcon(icon: string) {
							this.icon = icon;
							return this;
						},
						setTitle(title: string) {
							this.title = title;
							return this;
						},
						title: "",
					};
					callback(menuItem);
					latestMenu?.items.push({
						click: menuItem.click,
						icon: menuItem.icon,
						title: menuItem.title,
					});
					return menu;
				},
				showAtMouseEvent: (event: MouseEvent) => {
					if (latestMenu) {
						latestMenu.mouseEvent = event;
					}
				},
				showAtPosition: (position: {
					left?: boolean;
					width?: number;
					x: number;
					y: number;
				}) => {
					if (latestMenu) {
						latestMenu.position = position;
					}
				},
			};
			return menu;
		},
		createTotpSnapshot: async (): Promise<TotpCodeSnapshot> => ({
			code: "123456",
			secondsRemaining: 18,
		}),
		getEntries: () => entries,
		getErrorMessage: () => "translated-error",
		handleAddEntryCommand: async () => true,
		handleBulkImportOtpauthLinksCommand: async () => true,
		lockVault: () => {
			callLog.push("lockVault");
		},
		promptToEditEntry: async (entry: TotpEntryRecord) => {
			callLog.push(`edit:${entry.id}`);
			return nextEditResult;
		},
		promptToInitializeVault: async () => true,
		promptToUnlockVault: async () => true,
		reorderEntriesByIds: async (nextOrderedIds: readonly string[]) => {
			callLog.push(`reorder:${nextOrderedIds.join(",")}`);
			const nextEntries = nextOrderedIds
				.map((entryId) => entries.find((entry) => entry.id === entryId))
				.filter((entry): entry is TotpEntryRecord => entry !== undefined);
			entries.splice(0, entries.length, ...nextEntries);
		},
		showNotice: (message: string) => {
			callLog.push(`notice:${message}`);
		},
		t: (key: string, variables: TranslationVariables = {}) =>
			Object.keys(variables).length === 0
				? key
				: `${key}:${JSON.stringify(variables)}`,
	};
	const codeRefreshLog: Array<ReturnType<TotpManagerViewState["getDragState"]>> = [];
	let refreshCount = 0;
	const controller = new TotpManagerViewController(
		environment,
		state,
		{
			syncDragState: (dragState) => {
				codeRefreshLog.push(dragState);
			},
		},
		async () => {
			refreshCount += 1;
		},
	);

	state.syncEntries(entries);

	return {
		callLog,
		codeRefreshLog,
		controller,
		entries,
		getLatestMenu: () => latestMenu,
		setConfirmDeleteResult: (nextValue: boolean) => {
			nextDeleteResult = nextValue;
		},
		setEditResult: (nextValue: boolean) => {
			nextEditResult = nextValue;
		},
		state,
		getRefreshCount: () => refreshCount,
	};
}

function createMouseEvent(): MouseEvent {
	return {
		altKey: false,
		button: 0,
		clientX: 20,
		clientY: 30,
		ctrlKey: false,
		defaultPrevented: false,
		metaKey: false,
		preventDefault() {},
		shiftKey: false,
	} as MouseEvent;
}

test("TotpManagerViewController copies a code on plain card click", async () => {
	const harness = createControllerHarness();

	await harness.controller.handleCardClick(harness.entries[0], createMouseEvent());

	assert.deepEqual(harness.callLog, [
		"copy:123456",
		'notice:notice.codeCopied:{"accountName":"entry-1@example.com"}',
	]);
	assert.equal(harness.getRefreshCount(), 0);
});

test("TotpManagerViewController toggles selection instead of copying while in selection mode", async () => {
	const harness = createControllerHarness();
	harness.state.enterSelectionMode(harness.entries[0].id);

	await harness.controller.handleCardClick(harness.entries[1], createMouseEvent());

	assert.equal(harness.state.isEntrySelected(harness.entries[1].id), true);
	assert.deepEqual(harness.callLog, []);
	assert.equal(harness.getRefreshCount(), 1);
});

test("TotpManagerViewController opens the keyboard menu at the card position", async () => {
	const harness = createControllerHarness();
	const card = new FakeElement("div");
	card.setBoundingClientRect({
		height: 60,
		right: 220,
		top: 100,
		width: 140,
	});
	const event = {
		altKey: false,
		ctrlKey: false,
		defaultPrevented: false,
		key: "ContextMenu",
		metaKey: false,
		preventDefault() {},
		shiftKey: false,
	} as KeyboardEvent;

	await harness.controller.handleCardKeyDown(
		harness.entries[0],
		card as unknown as HTMLElement,
		event,
	);

	const menu = harness.getLatestMenu();
	assert.ok(menu);
	assert.deepEqual(menu.position, {
		left: true,
		width: 140,
		x: 208,
		y: 130,
	});
	assert.deepEqual(
		menu.items.map((item) => item.title),
		["common.edit", "common.delete"],
	);
	menu.items[0]?.click?.();
	assert.deepEqual(harness.callLog, ["edit:entry-1"]);
});

test("TotpManagerViewController only updates selection after a successful bulk delete", async () => {
	const harness = createControllerHarness({
		confirmDeleteResult: false,
	});
	harness.state.enterSelectionMode(harness.entries[0].id);
	harness.state.toggleEntrySelection(harness.entries[1].id);

	await harness.controller.deleteSelectedEntries();

	assert.equal(harness.state.getSelectedCount(), 2);
	assert.equal(harness.getRefreshCount(), 0);

	harness.setConfirmDeleteResult(true);
	await harness.controller.deleteSelectedEntries();

	assert.equal(harness.state.getSelectedCount(), 0);
	assert.equal(harness.state.isSelectionMode(), true);
	assert.equal(harness.getRefreshCount(), 1);
	assert.deepEqual(harness.callLog, [
		"deleteEntries:entry-1,entry-2",
		"deleteEntries:entry-1,entry-2",
	]);
});

test("TotpManagerViewController exits selection mode only after a successful edit", async () => {
	const harness = createControllerHarness({
		editResult: false,
	});
	harness.state.enterSelectionMode(harness.entries[0].id);

	await harness.controller.editSelectedEntry();

	assert.equal(harness.state.isSelectionMode(), true);
	assert.equal(harness.getRefreshCount(), 0);

	harness.setEditResult(true);
	await harness.controller.editSelectedEntry();

	assert.equal(harness.state.isSelectionMode(), false);
	assert.equal(harness.getRefreshCount(), 1);
	assert.deepEqual(harness.callLog, ["edit:entry-1", "edit:entry-1"]);
});

test("TotpManagerViewController skips persistence when a dragged block is dropped onto itself", async () => {
	const harness = createControllerHarness();
	harness.state.enterSelectionMode(harness.entries[0].id);
	const dragEvent = {
		dataTransfer: {
			effectAllowed: "none",
			setData() {},
		},
		preventDefault() {},
	} as DragEvent;
	const card = new FakeElement("div");
	card.setBoundingClientRect({
		height: 40,
		right: 120,
		top: 0,
		width: 120,
	});

	harness.controller.handleCardDragStart(harness.entries[0], dragEvent);
	await harness.controller.handleCardDrop(
		harness.entries[0],
		card as unknown as HTMLElement,
		{
			clientY: 30,
			preventDefault() {},
		} as DragEvent,
	);

	assert.deepEqual(harness.callLog, []);
	assert.equal(harness.state.getDragState(), null);
	assert.deepEqual(harness.codeRefreshLog, [
		{
			movedIds: ["entry-1"],
			overEntryId: null,
			placement: "before",
		},
		null,
	]);
});

test("TotpManagerViewController persists a reordered selection block and keeps it selected", async () => {
	const harness = createControllerHarness();
	harness.state.enterSelectionMode(harness.entries[0].id);
	harness.state.toggleEntrySelection(harness.entries[1].id);
	const dragEvent = {
		dataTransfer: {
			effectAllowed: "none",
			setData() {},
		},
		preventDefault() {},
	} as DragEvent;
	const targetCard = new FakeElement("div");
	targetCard.setBoundingClientRect({
		height: 40,
		right: 120,
		top: 0,
		width: 120,
	});

	harness.controller.handleCardDragStart(harness.entries[0], dragEvent);
	await harness.controller.handleCardDrop(
		harness.entries[2],
		targetCard as unknown as HTMLElement,
		{
			clientY: 30,
			preventDefault() {},
		} as DragEvent,
	);

	assert.deepEqual(harness.callLog, ["reorder:entry-3,entry-1,entry-2"]);
	assert.deepEqual(harness.state.getSelectedVisibleEntryIds(), ["entry-1", "entry-2"]);
	assert.equal(harness.state.getDragState(), null);
	assert.deepEqual(harness.codeRefreshLog, [
		{
			movedIds: ["entry-1", "entry-2"],
			overEntryId: null,
			placement: "before",
		},
		null,
	]);
});
