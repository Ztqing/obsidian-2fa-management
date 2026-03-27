type TotpManagerViewCopyFeedbackTimerHandle = ReturnType<typeof globalThis.setTimeout>;

interface TotpManagerViewCopyFeedbackTimerApi {
	clearTimeout: (timerId: TotpManagerViewCopyFeedbackTimerHandle) => void;
	setTimeout: (
		handler: () => void,
		timeoutMs: number,
	) => TotpManagerViewCopyFeedbackTimerHandle;
}

function createGlobalTimerApi(): TotpManagerViewCopyFeedbackTimerApi | null {
	if (
		typeof globalThis.setTimeout !== "function" ||
		typeof globalThis.clearTimeout !== "function"
	) {
		return null;
	}

	return {
		clearTimeout: (timerId) => {
			globalThis.clearTimeout(timerId);
		},
		setTimeout: (handler, timeoutMs) => globalThis.setTimeout(handler, timeoutMs),
	};
}

function findCardCodeRow(card?: HTMLElement): HTMLElement | null {
	if (!card) {
		return null;
	}

	const fakeCard = card as HTMLElement & {
		findAll?: (selector: string) => HTMLElement[];
	};

	if (typeof fakeCard.findAll === "function") {
		return fakeCard.findAll(".twofa-entry-card__code-row")[0] ?? null;
	}

	return card.querySelector?.(".twofa-entry-card__code-row") ?? null;
}

export class TotpManagerViewCopyFeedbackController {
	private readonly codeRowTimers = new Map<
		HTMLElement,
		TotpManagerViewCopyFeedbackTimerHandle
	>();
	private readonly timerApi = createGlobalTimerApi();

	flashCardCodeRow(card?: HTMLElement): void {
		if (!this.timerApi) {
			return;
		}

		const codeRow = findCardCodeRow(card);
		if (!codeRow) {
			return;
		}

		const previousTimerId = this.codeRowTimers.get(codeRow);
		if (typeof previousTimerId === "number") {
			this.timerApi.clearTimeout(previousTimerId);
		}

		codeRow.classList.add("is-copy-success");
		const timerId = this.timerApi.setTimeout(() => {
			codeRow.classList.remove("is-copy-success");
			this.codeRowTimers.delete(codeRow);
		}, 520);
		this.codeRowTimers.set(codeRow, timerId);
	}

	destroy(): void {
		if (!this.timerApi) {
			return;
		}

		for (const [codeRow, timerId] of this.codeRowTimers) {
			this.timerApi.clearTimeout(timerId);
			codeRow.classList.remove("is-copy-success");
		}

		this.codeRowTimers.clear();
	}
}
