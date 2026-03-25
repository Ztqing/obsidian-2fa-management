import assert from "node:assert/strict";
import test from "node:test";
import type { TotpDisplaySnapshot } from "../src/totp/display";
import type { TotpEntryRecord } from "../src/types";
import {
	TotpCodeRefreshController,
	type EntryRowRefs,
	renderStaticCode,
} from "../src/ui/views/totp-manager-view-code-refresh";
import { FakeElement } from "./support/fake-dom";

function createEntry(id: string): TotpEntryRecord {
	return {
		accountName: `${id}@example.com`,
		algorithm: "SHA-1",
		digits: 6,
		id,
		issuer: `Issuer ${id}`,
		period: 30,
		secret: "JBSWY3DPEHPK3PXP",
		sortOrder: Number(id.replace(/\D+/g, "")) || 0,
	};
}

function createRowRefs(): {
	refs: EntryRowRefs;
} {
	const cardEl = new FakeElement("div");
	const codeEl = new FakeElement("code");
	const countdownBadgeEl = new FakeElement("div");
	const countdownEl = new FakeElement("div");
	const nextCodeEl = new FakeElement("code");

	return {
		refs: {
			activeTransitionEl: null,
			cardEl: cardEl as unknown as HTMLElement,
			codeAnimationTimeoutId: null,
			codeAnimationToken: 0,
			codeEl: codeEl as unknown as HTMLElement,
			countdownBadgeEl: countdownBadgeEl as unknown as HTMLElement,
			countdownEl: countdownEl as unknown as HTMLElement,
			nextCodeEl: nextCodeEl as unknown as HTMLElement,
			previousCurrentCode: null,
		},
	};
}

function createPluginStub() {
	return {
		getErrorMessage: () => "translated-error",
		isUnlocked: () => true,
		t: (key: string, variables: Record<string, number> = {}) =>
			Object.keys(variables).length === 0
				? key
				: `${key}:${JSON.stringify(variables)}`,
	};
}

type FakeVisibilityEntry = {
	isIntersecting: boolean;
	target: Element;
};

class FakeVisibilityObserver {
	readonly observedTargets: Element[] = [];
	readonly unobservedTargets: Element[] = [];
	disconnectCount = 0;
	private callback: ((entries: FakeVisibilityEntry[]) => void) | null = null;

	connect(callback: (entries: FakeVisibilityEntry[]) => void): FakeVisibilityObserver {
		this.callback = callback;
		return this;
	}

	disconnect(): void {
		this.disconnectCount += 1;
	}

	emit(entries: FakeVisibilityEntry[]): void {
		if (!this.callback) {
			throw new Error("Expected visibility observer callback");
		}

		this.callback(entries);
	}

	observe(target: Element): void {
		this.observedTargets.push(target);
	}

	unobserve(target: Element): void {
		this.unobservedTargets.push(target);
	}
}

test("TotpCodeRefreshController updates the code row for successful snapshots", async () => {
	const entry = createEntry("entry-1");
	const { refs } = createRowRefs();
	const controller = new TotpCodeRefreshController({
		createDisplaySnapshot: async () =>
			({
				counter: 1,
				currentCode: "123456",
				hasNextCode: true,
				isRefreshingSoon: true,
				nextCode: "654321",
				nextCounter: 2,
				period: 30,
				progressPercent: 83.33,
				secondsRemaining: 5,
			}) satisfies TotpDisplaySnapshot,
		shouldReduceMotion: () => false,
		timerApi: {
			clearTimeout() {},
			setTimeout: () => 1,
		},
	});

	controller.registerRow(entry, refs);
	await controller.refreshVisibleCodes(createPluginStub(), [entry]);

	assert.equal((refs.codeEl as unknown as FakeElement).textContent, "123456");
	assert.equal((refs.countdownEl as unknown as FakeElement).textContent, "5");
	assert.equal(
		(refs.countdownBadgeEl as unknown as FakeElement).getAttribute("aria-label"),
		'view.entry.countdown:{"seconds":5}',
	);
	assert.equal(
		(refs.countdownBadgeEl as unknown as FakeElement).cssProps["--countdown-progress"],
		"83.33%",
	);
	assert.equal((refs.nextCodeEl as unknown as FakeElement).textContent, "654321");
	assert.equal((refs.countdownBadgeEl as unknown as FakeElement).hasClass("is-warning"), true);
});

test("TotpCodeRefreshController renders fallback error state when snapshot creation fails", async () => {
	const entry = createEntry("entry-1");
	const { refs } = createRowRefs();
	const controller = new TotpCodeRefreshController({
		createDisplaySnapshot: async () => {
			throw new Error("boom");
		},
	});

	controller.registerRow(entry, refs);
	await controller.refreshVisibleCodes(createPluginStub(), [entry]);

	assert.equal((refs.codeEl as unknown as FakeElement).textContent, "view.entry.error");
	assert.equal((refs.codeEl as unknown as FakeElement).hasClass("is-error"), true);
	assert.equal((refs.countdownEl as unknown as FakeElement).textContent, "!");
	assert.equal(
		(refs.countdownBadgeEl as unknown as FakeElement).cssProps["--countdown-progress"],
		"0%",
	);
	assert.equal(
		(refs.countdownBadgeEl as unknown as FakeElement).getAttribute("aria-label"),
		"translated-error",
	);
	assert.equal((refs.nextCodeEl as unknown as FakeElement).textContent, "------");
});

test("TotpCodeRefreshController uses fade transitions under reduced motion", async () => {
	const entry = createEntry("entry-1");
	const { refs } = createRowRefs();
	renderStaticCode(refs.codeEl, "111111");
	refs.previousCurrentCode = "111111";
	const scheduledTimeouts: Array<() => void> = [];
	const controller = new TotpCodeRefreshController({
		createDisplaySnapshot: async () =>
			({
				counter: 1,
				currentCode: "222222",
				hasNextCode: true,
				isRefreshingSoon: false,
				nextCode: "333333",
				nextCounter: 2,
				period: 30,
				progressPercent: 20,
				secondsRemaining: 24,
			}) satisfies TotpDisplaySnapshot,
		shouldReduceMotion: () => true,
		timerApi: {
			clearTimeout() {},
			setTimeout: (handler) => {
				scheduledTimeouts.push(handler);
				return scheduledTimeouts.length;
			},
		},
	});

	controller.registerRow(entry, refs);
	await controller.refreshVisibleCodes(createPluginStub(), [entry]);

	const codeEl = refs.codeEl as unknown as FakeElement;
	assert.equal(codeEl.textContent, "");
	assert.equal(codeEl.children.length, 1);
	const transitionEl = codeEl.children[0];
	assert.ok(transitionEl);
	assert.equal(transitionEl.hasClass("twofa-code-transition--fade"), true);
	assert.equal(transitionEl.hasClass("twofa-code-transition--slide"), false);
	assert.equal(transitionEl.children.length, 2);
	assert.equal(transitionEl.children[0]?.hasClass("twofa-code-transition__layer--old"), true);
	assert.equal(transitionEl.children[0]?.textContent, "111111");
	assert.equal(transitionEl.children[1]?.hasClass("twofa-code-transition__layer--new"), true);
	assert.equal(transitionEl.children[1]?.textContent, "222222");
	assert.equal(refs.codeAnimationTimeoutId, 1);
	assert.equal(refs.activeTransitionEl, transitionEl as unknown as HTMLElement);
	scheduledTimeouts[0]?.();
	assert.equal(codeEl.textContent, "222222");
	assert.equal(codeEl.children.length, 0);
	assert.equal(refs.activeTransitionEl, null);
});

test("TotpCodeRefreshController clears the previous transition before starting a new one", async () => {
	const entry = createEntry("entry-1");
	const { refs } = createRowRefs();
	renderStaticCode(refs.codeEl, "111111");
	refs.previousCurrentCode = "111111";
	const scheduledTimeouts: Array<() => void> = [];
	const clearedTimeoutIds: number[] = [];
	let snapshotIndex = 0;
	const snapshots = [
		{
			counter: 1,
			currentCode: "222222",
			hasNextCode: true,
			isRefreshingSoon: false,
			nextCode: "333333",
			nextCounter: 2,
			period: 30,
			progressPercent: 20,
			secondsRemaining: 24,
		},
		{
			counter: 2,
			currentCode: "333333",
			hasNextCode: true,
			isRefreshingSoon: false,
			nextCode: "444444",
			nextCounter: 3,
			period: 30,
			progressPercent: 50,
			secondsRemaining: 15,
		},
	] satisfies TotpDisplaySnapshot[];
	const controller = new TotpCodeRefreshController({
		createDisplaySnapshot: async () => snapshots[snapshotIndex++] as TotpDisplaySnapshot,
		shouldReduceMotion: () => false,
		timerApi: {
			clearTimeout: (timerId) => {
				clearedTimeoutIds.push(timerId);
			},
			setTimeout: (handler) => {
				scheduledTimeouts.push(handler);
				return scheduledTimeouts.length;
			},
		},
	});

	controller.registerRow(entry, refs);
	await controller.refreshVisibleCodes(createPluginStub(), [entry]);

	const codeEl = refs.codeEl as unknown as FakeElement;
	assert.equal(codeEl.children.length, 1);
	assert.equal(codeEl.children[0]?.children[0]?.textContent, "111111");
	assert.equal(codeEl.children[0]?.children[1]?.textContent, "222222");
	assert.equal(refs.activeTransitionEl, codeEl.children[0] as unknown as HTMLElement);
	assert.equal(refs.codeAnimationTimeoutId, 1);

	await controller.refreshVisibleCodes(createPluginStub(), [entry]);

	assert.deepEqual(clearedTimeoutIds, [1]);
	assert.equal(codeEl.textContent, "");
	assert.equal(codeEl.children.length, 1);
	assert.equal(codeEl.children[0]?.children[0]?.textContent, "222222");
	assert.equal(codeEl.children[0]?.children[1]?.textContent, "333333");
	assert.equal(refs.activeTransitionEl, codeEl.children[0] as unknown as HTMLElement);
	assert.equal(refs.codeAnimationTimeoutId, 2);

	scheduledTimeouts[0]?.();
	assert.equal(codeEl.children.length, 1);
	assert.equal(codeEl.textContent, "");

	scheduledTimeouts[1]?.();
	assert.equal(codeEl.children.length, 0);
	assert.equal(codeEl.textContent, "333333");
	assert.equal(refs.activeTransitionEl, null);
});

test("TotpCodeRefreshController syncs drag classes for dragging and drop placement", () => {
	const entryOne = createEntry("entry-1");
	const entryTwo = createEntry("entry-2");
	const firstRow = createRowRefs();
	const secondRow = createRowRefs();
	const controller = new TotpCodeRefreshController();

	controller.registerRow(entryOne, firstRow.refs);
	controller.registerRow(entryTwo, secondRow.refs);

	controller.syncDragState({
		movedIds: [entryOne.id],
		overEntryId: entryTwo.id,
		placement: "after",
	});

	assert.equal((firstRow.refs.cardEl as unknown as FakeElement).hasClass("is-dragging"), true);
	assert.equal(
		(secondRow.refs.cardEl as unknown as FakeElement).hasClass("is-drop-after"),
		true,
	);
	assert.equal(
		(secondRow.refs.cardEl as unknown as FakeElement).hasClass("is-drop-before"),
		false,
	);
});

test("TotpCodeRefreshController reapplies cached row content after rows are recreated", async () => {
	const entry = createEntry("entry-1");
	const firstRow = createRowRefs();
	const secondRow = createRowRefs();
	const controller = new TotpCodeRefreshController({
		createDisplaySnapshot: async () =>
			({
				counter: 1,
				currentCode: "123456",
				hasNextCode: true,
				isRefreshingSoon: false,
				nextCode: "654321",
				nextCounter: 2,
				period: 30,
				progressPercent: 50,
				secondsRemaining: 15,
			}) satisfies TotpDisplaySnapshot,
	});

	controller.registerRow(entry, firstRow.refs);
	await controller.refreshVisibleCodes(createPluginStub(), [entry]);
	controller.resetRows();
	controller.registerRow(entry, secondRow.refs);

	assert.equal((secondRow.refs.codeEl as unknown as FakeElement).textContent, "123456");
	assert.equal((secondRow.refs.countdownEl as unknown as FakeElement).textContent, "15");
	assert.equal((secondRow.refs.nextCodeEl as unknown as FakeElement).textContent, "654321");
});

test("TotpCodeRefreshController skips next-code generation when it is hidden", async () => {
	const entry = createEntry("entry-1");
	const { refs } = createRowRefs();
	const snapshotRequests: boolean[] = [];
	const controller = new TotpCodeRefreshController({
		createDisplaySnapshot: async (_entry, _timestampMs, options) => {
			snapshotRequests.push(options?.includeNextCode ?? true);
			return {
				counter: 1,
				currentCode: "123456",
				hasNextCode: options?.includeNextCode ?? true,
				isRefreshingSoon: false,
				nextCode: "",
				nextCounter: 2,
				period: 30,
				progressPercent: 20,
				secondsRemaining: 24,
			};
		},
	});

	controller.registerRow(entry, refs);
	await controller.refreshVisibleCodes(createPluginStub(), [entry], {
		showUpcomingCodes: false,
	});

	assert.deepEqual(snapshotRequests, [false]);
	assert.equal((refs.nextCodeEl as unknown as FakeElement).textContent, "------");
});

test("TotpCodeRefreshController only refreshes rows reported inside the viewport", async () => {
	const entryOne = createEntry("entry-1");
	const entryTwo = createEntry("entry-2");
	const firstRow = createRowRefs();
	const secondRow = createRowRefs();
	const refreshedEntryIds: string[] = [];
	const visibilityObserver = new FakeVisibilityObserver();

	const controller = new TotpCodeRefreshController({
		createDisplaySnapshot: async (entry) => {
			refreshedEntryIds.push(entry.id);
			return {
				counter: 1,
				currentCode: entry.id === entryOne.id ? "111111" : "222222",
				hasNextCode: false,
				isRefreshingSoon: false,
				nextCode: "",
				nextCounter: 2,
				period: 30,
				progressPercent: 50,
				secondsRemaining: 15,
				};
			},
			createVisibilityObserver: (callback) => {
				return visibilityObserver.connect(callback);
			},
		});

	controller.registerRow(entryOne, firstRow.refs);
	controller.registerRow(entryTwo, secondRow.refs);

	await controller.refreshVisibleCodes(createPluginStub(), [entryOne, entryTwo]);
	assert.deepEqual(refreshedEntryIds, [entryOne.id, entryTwo.id]);

	refreshedEntryIds.length = 0;
	visibilityObserver.emit([
		{
			isIntersecting: true,
			target: firstRow.refs.cardEl as unknown as Element,
		},
		{
			isIntersecting: false,
			target: secondRow.refs.cardEl as unknown as Element,
		},
	]);

	await controller.refreshVisibleCodes(createPluginStub(), [entryOne, entryTwo]);
	assert.deepEqual(refreshedEntryIds, [entryOne.id]);

	refreshedEntryIds.length = 0;
	visibilityObserver.emit([
		{
			isIntersecting: false,
			target: firstRow.refs.cardEl as unknown as Element,
		},
	]);

	await controller.refreshVisibleCodes(createPluginStub(), [entryOne, entryTwo]);
	assert.deepEqual(refreshedEntryIds, []);
});

test("TotpCodeRefreshController falls back before observer priming and then refreshes only intersecting rows", async () => {
	const entryOne = createEntry("entry-1");
	const entryTwo = createEntry("entry-2");
	const firstRow = createRowRefs();
	const secondRow = createRowRefs();
	const recreatedFirstRow = createRowRefs();
	const refreshCounts = new Map<string, number>();
	const visibilityObserver = new FakeVisibilityObserver();

	const controller = new TotpCodeRefreshController({
		createDisplaySnapshot: async (entry) => {
			const nextCount = (refreshCounts.get(entry.id) ?? 0) + 1;
			refreshCounts.set(entry.id, nextCount);
			return {
				counter: nextCount,
				currentCode: `${entry.id}-code-${nextCount}`,
				hasNextCode: true,
				isRefreshingSoon: false,
				nextCode: `${entry.id}-next-${nextCount}`,
				nextCounter: nextCount + 1,
				period: 30,
				progressPercent: 50,
				secondsRemaining: 15,
				};
			},
			createVisibilityObserver: (callback) => {
				return visibilityObserver.connect(callback);
			},
			timerApi: {
				clearTimeout() {},
				setTimeout: (handler) => {
					handler();
					return 1;
				},
			},
		});

	controller.registerRow(entryOne, firstRow.refs);
	controller.registerRow(entryTwo, secondRow.refs);
	await controller.refreshVisibleCodes(createPluginStub(), [entryOne, entryTwo]);

	assert.deepEqual(
		refreshCounts,
		new Map([
			[entryOne.id, 1],
			[entryTwo.id, 1],
		]),
	);
	assert.equal((firstRow.refs.codeEl as unknown as FakeElement).textContent, "entry-1-code-1");
	assert.equal((secondRow.refs.codeEl as unknown as FakeElement).textContent, "entry-2-code-1");
	assert.deepEqual(visibilityObserver.observedTargets, [
		firstRow.refs.cardEl as unknown as Element,
		secondRow.refs.cardEl as unknown as Element,
	]);

	visibilityObserver.emit([
		{
			isIntersecting: true,
			target: firstRow.refs.cardEl as unknown as Element,
		},
		{
			isIntersecting: false,
			target: secondRow.refs.cardEl as unknown as Element,
		},
	]);

	await controller.refreshVisibleCodes(createPluginStub(), [entryOne, entryTwo]);

	assert.deepEqual(
		refreshCounts,
		new Map([
			[entryOne.id, 2],
			[entryTwo.id, 1],
		]),
	);
	assert.equal((firstRow.refs.codeEl as unknown as FakeElement).textContent, "entry-1-code-2");
	assert.equal((secondRow.refs.codeEl as unknown as FakeElement).textContent, "entry-2-code-1");

	controller.resetRows();
	controller.registerRow(entryOne, recreatedFirstRow.refs);
	await controller.refreshVisibleCodes(createPluginStub(), [entryOne]);

	assert.deepEqual(
		refreshCounts,
		new Map([
			[entryOne.id, 3],
			[entryTwo.id, 1],
		]),
	);
	assert.equal(
		(recreatedFirstRow.refs.codeEl as unknown as FakeElement).textContent,
		"entry-1-code-3",
	);
	assert.deepEqual(visibilityObserver.unobservedTargets, [
		firstRow.refs.cardEl as unknown as Element,
		secondRow.refs.cardEl as unknown as Element,
	]);

	controller.destroy();
	assert.equal(visibilityObserver.disconnectCount, 1);
});
