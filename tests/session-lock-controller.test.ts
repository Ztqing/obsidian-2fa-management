import assert from "node:assert/strict";
import test from "node:test";
import { SessionLockController } from "../src/application/session-lock-controller";
import type { LockTimeoutMode } from "../src/types";

function createHarness(options: {
	isUnlocked?: boolean;
	lockTimeoutMinutes?: number;
	lockTimeoutMode?: LockTimeoutMode;
} = {}) {
	let isUnlocked = options.isUnlocked ?? true;
	let lockTimeoutMinutes = options.lockTimeoutMinutes ?? 15;
	let lockTimeoutMode = options.lockTimeoutMode ?? "custom";
	let nextTimerId = 1;
	let lockCount = 0;
	const scheduledTimers = new Map<number, () => void>();
	const timerDurations = new Map<number, number>();
	const clearedTimerIds: number[] = [];

	const controller = new SessionLockController({
		getLockTimeoutMinutes: () => lockTimeoutMinutes,
		getLockTimeoutMode: () => lockTimeoutMode,
		isUnlocked: () => isUnlocked,
		lockVaultDueToTimeout: () => {
			lockCount += 1;
			isUnlocked = false;
		},
		timerApi: {
			clearTimeout: (timerId) => {
				clearedTimerIds.push(timerId);
				scheduledTimers.delete(timerId);
				timerDurations.delete(timerId);
			},
			setTimeout: (handler, timeoutMs) => {
				const timerId = nextTimerId++;
				scheduledTimers.set(timerId, handler);
				timerDurations.set(timerId, timeoutMs);
				return timerId;
			},
		},
	});

	return {
		controller,
		getClearedTimerIds: () => [...clearedTimerIds],
		getLockCount: () => lockCount,
		getScheduledTimerIds: () => [...scheduledTimers.keys()],
		getTimerDuration: (timerId: number) => timerDurations.get(timerId) ?? null,
		runTimer: (timerId: number) => {
			const handler = scheduledTimers.get(timerId);
			scheduledTimers.delete(timerId);
			timerDurations.delete(timerId);
			handler?.();
		},
		setLockTimeoutMinutes: (nextMinutes: number) => {
			lockTimeoutMinutes = nextMinutes;
		},
		setLockTimeoutMode: (nextMode: LockTimeoutMode) => {
			lockTimeoutMode = nextMode;
		},
		setUnlocked: (nextUnlocked: boolean) => {
			isUnlocked = nextUnlocked;
		},
	};
}

test("SessionLockController schedules a timeout only for unlocked custom sessions", () => {
	const harness = createHarness({
		isUnlocked: true,
		lockTimeoutMinutes: 7,
		lockTimeoutMode: "custom",
	});

	harness.controller.syncState();

	assert.deepEqual(harness.getScheduledTimerIds(), [1]);
	assert.equal(harness.getTimerDuration(1), 7 * 60_000);

	harness.setLockTimeoutMode("on-restart");
	harness.controller.syncState();

	assert.deepEqual(harness.getScheduledTimerIds(), []);
	assert.deepEqual(harness.getClearedTimerIds(), [1]);
});

test("SessionLockController resets the timer on activity", () => {
	const harness = createHarness();

	harness.controller.syncState();
	harness.controller.noteActivity();

	assert.deepEqual(harness.getClearedTimerIds(), [1]);
	assert.deepEqual(harness.getScheduledTimerIds(), [2]);
});

test("SessionLockController locks the vault when the timeout fires", () => {
	const harness = createHarness();

	harness.controller.syncState();
	harness.runTimer(1);

	assert.equal(harness.getLockCount(), 1);
	assert.deepEqual(harness.getScheduledTimerIds(), []);
});

test("SessionLockController destroys pending timers", () => {
	const harness = createHarness();

	harness.controller.syncState();
	harness.controller.destroy();

	assert.deepEqual(harness.getScheduledTimerIds(), []);
	assert.deepEqual(harness.getClearedTimerIds(), [1]);
});

test("SessionLockController does not schedule when the vault is locked", () => {
	const harness = createHarness({
		isUnlocked: false,
		lockTimeoutMode: "custom",
	});

	harness.controller.syncState();
	harness.controller.noteActivity();

	assert.deepEqual(harness.getScheduledTimerIds(), []);
	assert.equal(harness.getLockCount(), 0);
});
