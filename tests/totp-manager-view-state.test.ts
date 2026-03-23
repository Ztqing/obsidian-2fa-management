import assert from "node:assert/strict";
import test from "node:test";
import type { TotpEntryRecord } from "../src/types";
import {
	getEntryDropPlacement,
	type TimerApi,
	TotpManagerViewState,
} from "../src/ui/views/totp-manager-view-state";

const entries: TotpEntryRecord[] = [
	{
		id: "alpha",
		sortOrder: 0,
		issuer: "Alpha",
		accountName: "alpha@example.com",
		secret: "JBSWY3DPEHPK3PXP",
		algorithm: "SHA-1",
		digits: 6,
		period: 30,
	},
	{
		id: "bravo",
		sortOrder: 1,
		issuer: "Bravo",
		accountName: "bravo@example.com",
		secret: "JBSWY3DPEHPK3PXP",
		algorithm: "SHA-1",
		digits: 6,
		period: 30,
	},
	{
		id: "charlie",
		sortOrder: 2,
		issuer: "Charlie",
		accountName: "charlie@example.com",
		secret: "JBSWY3DPEHPK3PXP",
		algorithm: "SHA-1",
		digits: 6,
		period: 30,
	},
];

class FakeTimerApi implements TimerApi {
	private nextTimerId = 1;
	private scheduledTimers = new Map<number, () => void>();

	clearTimeout(timerId: number): void {
		this.scheduledTimers.delete(timerId);
	}

	runAll(): void {
		const callbacks = [...this.scheduledTimers.values()];
		this.scheduledTimers.clear();
		for (const callback of callbacks) {
			callback();
		}
	}

	setTimeout(handler: () => void, _timeoutMs: number): number {
		const timerId = this.nextTimerId++;
		this.scheduledTimers.set(timerId, handler);
		return timerId;
	}
}

function createPointerEvent(overrides: Partial<PointerEvent> = {}): PointerEvent {
	return {
		altKey: false,
		button: 0,
		clientX: 12,
		clientY: 16,
		ctrlKey: false,
		metaKey: false,
		pointerId: 1,
		shiftKey: false,
		target: null,
		...overrides,
	} as PointerEvent;
}

test("TotpManagerViewState keeps filtered entries in stored order", () => {
	const state = new TotpManagerViewState(new FakeTimerApi());

	state.syncEntries(entries);
	state.setSearchQuery("a", entries);

	assert.deepEqual(
		state.getVisibleEntries().map((entry) => entry.id),
		["alpha", "bravo", "charlie"],
	);
});

test("TotpManagerViewState exposes single and multi-selection helpers", () => {
	const state = new TotpManagerViewState(new FakeTimerApi());

	state.syncEntries(entries);
	state.enterSelectionMode("alpha");
	assert.equal(state.getSingleSelectedEntry(entries)?.id, "alpha");

	state.toggleEntrySelection("bravo");
	assert.equal(state.getSingleSelectedEntry(entries), null);
	assert.deepEqual(
		state.getSelectedEntries(entries).map((entry) => entry.id),
		["alpha", "bravo"],
	);

	state.removeEntriesFromSelection(state.getSelectedEntries(entries), 0);
	assert.equal(state.isSelectionMode(), false);
});

test("TotpManagerViewState enters selection mode after a long press", () => {
	const timers = new FakeTimerApi();
	const state = new TotpManagerViewState(timers);
	let refreshRequested = false;

	state.handlePointerDown("bravo", createPointerEvent(), () => {
		refreshRequested = true;
	});

	assert.equal(state.isSelectionMode(), false);
	timers.runAll();

	assert.equal(refreshRequested, true);
	assert.equal(state.isSelectionMode(), true);
	assert.equal(state.getSingleSelectedEntry(entries)?.id, "bravo");
});

test("TotpManagerViewState tracks drag state for the selected visible block", () => {
	const state = new TotpManagerViewState(new FakeTimerApi());

	state.syncEntries(entries);
	state.enterSelectionMode("alpha");
	state.toggleEntrySelection("bravo");

	assert.deepEqual(state.beginDrag("alpha"), ["alpha", "bravo"]);
	assert.equal(state.updateDragTarget("charlie", "after"), true);
	assert.deepEqual(state.getDragState(), {
		movedIds: ["alpha", "bravo"],
		overEntryId: "charlie",
		placement: "after",
	});
});

test("getEntryDropPlacement returns before/after based on the card midpoint", () => {
	assert.equal(
		getEntryDropPlacement(
			{
				height: 40,
				top: 100,
			} as DOMRect,
			110,
		),
		"before",
	);

	assert.equal(
		getEntryDropPlacement(
			{
				height: 40,
				top: 100,
			} as DOMRect,
			121,
		),
		"after",
	);
});

test("TotpManagerViewState clears interaction state when the vault becomes unavailable", () => {
	const timers = new FakeTimerApi();
	const state = new TotpManagerViewState(timers);

	state.syncEntries(entries);
	state.enterSelectionMode("alpha");
	state.beginDrag("alpha");
	state.handlePointerDown("alpha", createPointerEvent(), () => {});
	state.resetForUnavailableVault();

	assert.equal(state.isSelectionMode(), false);
	assert.deepEqual(state.getVisibleEntries(), []);
	assert.equal(state.getDragState(), null);
	assert.equal(state.consumeSuppressedClick("alpha"), false);
});
