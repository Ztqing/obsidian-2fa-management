import type { LockTimeoutMode } from "../types";

interface SessionLockTimerApi {
	clearTimeout(timerId: number): void;
	setTimeout(handler: () => void, timeoutMs: number): number;
}

export interface SessionLockControllerDependencies {
	getLockTimeoutMinutes(): number;
	getLockTimeoutMode(): LockTimeoutMode;
	isUnlocked(): boolean;
	lockVaultDueToTimeout(): void;
	timerApi?: SessionLockTimerApi;
}

const defaultTimerApi: SessionLockTimerApi = {
	clearTimeout: (timerId) => {
		window.clearTimeout(timerId);
	},
	setTimeout: (handler, timeoutMs) => window.setTimeout(handler, timeoutMs),
};

export class SessionLockController {
	private timerId: number | null = null;
	private readonly timerApi: SessionLockTimerApi;

	constructor(private readonly dependencies: SessionLockControllerDependencies) {
		this.timerApi = dependencies.timerApi ?? defaultTimerApi;
	}

	destroy(): void {
		this.clearTimer();
	}

	noteActivity(): void {
		if (!this.shouldTrackTimeout()) {
			return;
		}

		this.scheduleTimeout();
	}

	syncState(): void {
		if (!this.shouldTrackTimeout()) {
			this.clearTimer();
			return;
		}

		this.scheduleTimeout();
	}

	private clearTimer(): void {
		if (this.timerId === null) {
			return;
		}

		this.timerApi.clearTimeout(this.timerId);
		this.timerId = null;
	}

	private scheduleTimeout(): void {
		this.clearTimer();
		this.timerId = this.timerApi.setTimeout(() => {
			this.timerId = null;

			if (!this.shouldTrackTimeout()) {
				return;
			}

			this.dependencies.lockVaultDueToTimeout();
		}, this.dependencies.getLockTimeoutMinutes() * 60_000);
	}

	private shouldTrackTimeout(): boolean {
		return (
			this.dependencies.isUnlocked() &&
			this.dependencies.getLockTimeoutMode() === "custom"
		);
	}
}
