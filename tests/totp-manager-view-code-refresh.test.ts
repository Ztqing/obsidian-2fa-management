import assert from "node:assert/strict";
import test from "node:test";
import type { TotpDisplaySnapshot } from "../src/totp/display";
import type { TotpEntryRecord } from "../src/types";
import {
	TotpCodeRefreshController,
	type EntryRowRefs,
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

test("TotpCodeRefreshController updates the code row for successful snapshots", async () => {
	const entry = createEntry("entry-1");
	const { refs } = createRowRefs();
	const controller = new TotpCodeRefreshController({
		createDisplaySnapshot: async () =>
			({
				currentCode: "123456",
				isRefreshingSoon: true,
				nextCode: "654321",
				progressPercent: 83.33,
				secondsRemaining: 5,
			}) satisfies TotpDisplaySnapshot,
		shouldReduceMotion: () => false,
		timerApi: {
			clearTimeout() {},
			setTimeout: () => 1,
		},
	});

	controller.registerRow(entry.id, refs);
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

	controller.registerRow(entry.id, refs);
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
	refs.previousCurrentCode = "111111";
	const scheduledTimeouts: Array<() => void> = [];
	const controller = new TotpCodeRefreshController({
		createDisplaySnapshot: async () =>
			({
				currentCode: "222222",
				isRefreshingSoon: false,
				nextCode: "333333",
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

	controller.registerRow(entry.id, refs);
	await controller.refreshVisibleCodes(createPluginStub(), [entry]);

	const transitionEl = (refs.codeEl as unknown as FakeElement).children[0];
	assert.ok(transitionEl);
	assert.equal(transitionEl.hasClass("twofa-code-transition--fade"), true);
	assert.equal(transitionEl.hasClass("twofa-code-transition--slide"), false);
	assert.equal(refs.codeAnimationTimeoutId, 1);
	scheduledTimeouts[0]?.();
	assert.equal((refs.codeEl as unknown as FakeElement).textContent, "222222");
});

test("TotpCodeRefreshController syncs drag classes for dragging and drop placement", () => {
	const entryOne = createEntry("entry-1");
	const entryTwo = createEntry("entry-2");
	const firstRow = createRowRefs();
	const secondRow = createRowRefs();
	const controller = new TotpCodeRefreshController();

	controller.registerRow(entryOne.id, firstRow.refs);
	controller.registerRow(entryTwo.id, secondRow.refs);

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
				currentCode: "123456",
				isRefreshingSoon: false,
				nextCode: "654321",
				progressPercent: 50,
				secondsRemaining: 15,
			}) satisfies TotpDisplaySnapshot,
	});

	controller.registerRow(entry.id, firstRow.refs);
	await controller.refreshVisibleCodes(createPluginStub(), [entry]);
	controller.resetRows();
	controller.registerRow(entry.id, secondRow.refs);

	assert.equal((secondRow.refs.codeEl as unknown as FakeElement).textContent, "123456");
	assert.equal((secondRow.refs.countdownEl as unknown as FakeElement).textContent, "15");
	assert.equal((secondRow.refs.nextCodeEl as unknown as FakeElement).textContent, "654321");
});
