import {
	createTotpDisplaySnapshot,
	type TotpDisplaySnapshot,
} from "../../totp/display";
import type { TotpEntryRecord } from "../../types";
import type TwoFactorManagementPlugin from "../../plugin";
import {
	getCodeTransitionPlan,
	type CodeAnimationMode,
} from "./code-transition";
import type { DragState } from "./totp-manager-view-state";

const CODE_TRANSITION_SLIDE_DURATION_MS = 190;
const CODE_TRANSITION_FADE_DURATION_MS = 140;

export interface EntryRowRefs {
	cardEl: HTMLElement;
	codeEl: HTMLElement;
	countdownBadgeEl: HTMLElement;
	countdownEl: HTMLElement;
	nextCodeEl: HTMLElement | null;
	previousCurrentCode: string | null;
	codeAnimationTimeoutId: number | null;
	codeAnimationToken: number;
}

type CachedEntryDisplay =
	| {
			kind: "error";
			label: string;
			message: string;
	  }
	| {
			kind: "snapshot";
			countdownLabel: string;
			value: TotpDisplaySnapshot;
	  };

export function renderStaticCode(containerEl: HTMLElement, value: string): void {
	containerEl.empty();
	containerEl.setText(value);
}

interface TotpCodeRefreshTimerApi {
	clearTimeout: (timerId: number) => void;
	setTimeout: (handler: () => void, timeoutMs: number) => number;
}

export interface TotpCodeRefreshControllerDependencies {
	createDisplaySnapshot?: (
		entry: TotpEntryRecord,
	) => Promise<TotpDisplaySnapshot>;
	shouldReduceMotion?: () => boolean;
	timerApi?: TotpCodeRefreshTimerApi;
}

function createWindowTimerApi(): TotpCodeRefreshTimerApi {
	return {
		clearTimeout: (timerId) => {
			window.clearTimeout(timerId);
		},
		setTimeout: (handler, timeoutMs) => window.setTimeout(handler, timeoutMs),
	};
}

function shouldReduceMotionByPreference(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

export class TotpCodeRefreshController {
	private readonly rowRefs = new Map<string, EntryRowRefs>();
	private readonly cachedDisplays = new Map<string, CachedEntryDisplay>();
	private refreshRun = 0;
	private readonly createDisplaySnapshot: (
		entry: TotpEntryRecord,
	) => Promise<TotpDisplaySnapshot>;
	private readonly shouldReduceMotion: () => boolean;
	private readonly timerApi: TotpCodeRefreshTimerApi;

	constructor(dependencies: TotpCodeRefreshControllerDependencies = {}) {
		this.createDisplaySnapshot =
			dependencies.createDisplaySnapshot ?? createTotpDisplaySnapshot;
		this.shouldReduceMotion =
			dependencies.shouldReduceMotion ?? shouldReduceMotionByPreference;
		this.timerApi = dependencies.timerApi ?? createWindowTimerApi();
	}

	registerRow(entryId: string, refs: EntryRowRefs): void {
		this.rowRefs.set(entryId, refs);
		this.applyCachedDisplay(entryId, refs);
	}

	resetRows(): void {
		this.clearCodeTransitions();
		this.rowRefs.clear();
	}

	destroy(): void {
		this.resetRows();
		this.cachedDisplays.clear();
	}

	syncDragState(dragState: DragState | null): void {
		for (const [entryId, refs] of this.rowRefs) {
			const isDragging = dragState?.movedIds.includes(entryId) ?? false;
			const isDropTarget = dragState?.overEntryId === entryId && !isDragging;
			refs.cardEl.toggleClass("is-dragging", isDragging);
			refs.cardEl.toggleClass(
				"is-drop-before",
				isDropTarget && dragState?.placement === "before",
			);
			refs.cardEl.toggleClass(
				"is-drop-after",
				isDropTarget && dragState?.placement === "after",
			);
		}
	}

	async refreshVisibleCodes(
		plugin: Pick<TwoFactorManagementPlugin, "getErrorMessage" | "isUnlocked" | "t">,
		visibleEntries: readonly TotpEntryRecord[],
	): Promise<void> {
		if (!plugin.isUnlocked() || visibleEntries.length === 0) {
			return;
		}

		const currentRun = this.refreshRun + 1;
		this.refreshRun = currentRun;
		const snapshots = await Promise.all(
			visibleEntries.map(async (entry) => {
				try {
					return {
						entryId: entry.id,
						error: null,
						snapshot: await this.createDisplaySnapshot(entry),
					};
				} catch (error) {
					return {
						entryId: entry.id,
						error: plugin.getErrorMessage(error),
						snapshot: null,
					};
				}
			}),
		);

		if (currentRun !== this.refreshRun) {
			return;
		}

		for (const result of snapshots) {
			const refs = this.rowRefs.get(result.entryId);

			if (!refs) {
				continue;
			}

			if (result.snapshot) {
				this.cachedDisplays.set(result.entryId, {
					kind: "snapshot",
					countdownLabel: plugin.t("view.entry.countdown", {
						seconds: result.snapshot.secondsRemaining,
					}),
					value: result.snapshot,
				});
				this.applySnapshot(refs, result.snapshot, {
					animationMode: undefined,
					countdownLabel: plugin.t("view.entry.countdown", {
						seconds: result.snapshot.secondsRemaining,
					}),
				});
				continue;
			}

			const errorMessage = result.error ?? plugin.t("view.entry.refreshFallback");
			this.cachedDisplays.set(result.entryId, {
				kind: "error",
				label: plugin.t("view.entry.error"),
				message: errorMessage,
			});
			this.applyErrorState(refs, {
				errorLabel: plugin.t("view.entry.error"),
				errorMessage,
			});
		}
	}

	private applyCachedDisplay(entryId: string, refs: EntryRowRefs): void {
		const cachedDisplay = this.cachedDisplays.get(entryId);
		if (!cachedDisplay) {
			return;
		}

		if (cachedDisplay.kind === "snapshot") {
			this.applySnapshot(refs, cachedDisplay.value, {
				animationMode: "none",
				countdownLabel: cachedDisplay.countdownLabel,
			});
			return;
		}

		this.applyErrorState(refs, {
			errorLabel: cachedDisplay.label,
			errorMessage: cachedDisplay.message,
		});
	}

	private applySnapshot(
		refs: EntryRowRefs,
		snapshot: TotpDisplaySnapshot,
		options: {
			animationMode?: CodeAnimationMode;
			countdownLabel: string;
		},
	): void {
		const transitionPlan = getCodeTransitionPlan({
			nextCurrentCode: snapshot.currentCode,
			previousCurrentCode: refs.previousCurrentCode,
			reducedMotion: this.shouldReduceMotion(),
		});

		this.updateCurrentCodeDisplay(
			refs,
			snapshot.currentCode,
			options.animationMode ?? transitionPlan.currentAnimationMode,
		);
		refs.codeEl.removeClass("is-error");
		refs.countdownEl.setText(String(snapshot.secondsRemaining));
		refs.countdownBadgeEl.setAttribute("aria-label", options.countdownLabel);
		refs.countdownBadgeEl.setCssProps({
			"--countdown-progress": `${snapshot.progressPercent.toFixed(2)}%`,
		});
		refs.countdownBadgeEl.removeClass("is-error");
		refs.countdownBadgeEl.toggleClass("is-warning", snapshot.isRefreshingSoon);
		if (refs.nextCodeEl) {
			renderStaticCode(refs.nextCodeEl, snapshot.nextCode);
		}
		refs.previousCurrentCode = snapshot.currentCode;
	}

	private applyErrorState(
		refs: EntryRowRefs,
		options: {
			errorLabel: string;
			errorMessage: string;
		},
	): void {
		this.setCurrentCodeText(refs, options.errorLabel);
		refs.codeEl.addClass("is-error");
		refs.countdownEl.setText("!");
		refs.countdownBadgeEl.setCssProps({
			"--countdown-progress": "0%",
		});
		refs.countdownBadgeEl.removeClass("is-warning");
		refs.countdownBadgeEl.addClass("is-error");
		refs.countdownBadgeEl.setAttribute("aria-label", options.errorMessage);
		if (refs.nextCodeEl) {
			renderStaticCode(refs.nextCodeEl, "------");
		}
		refs.previousCurrentCode = null;
	}

	private updateCurrentCodeDisplay(
		refs: EntryRowRefs,
		nextCode: string,
		animationMode: CodeAnimationMode,
	): void {
		if (
			refs.previousCurrentCode === nextCode &&
			refs.codeAnimationTimeoutId === null
		) {
			return;
		}

		if (
			animationMode === "none" ||
			refs.previousCurrentCode === null ||
			refs.previousCurrentCode === nextCode
		) {
			this.setCurrentCodeText(refs, nextCode);
			return;
		}

		this.startCodeTransition(
			refs,
			refs.previousCurrentCode,
			nextCode,
			animationMode,
		);
	}

	private setCurrentCodeText(refs: EntryRowRefs, value: string): void {
		this.cancelCodeTransition(refs);
		renderStaticCode(refs.codeEl, value);
	}

	private startCodeTransition(
		refs: EntryRowRefs,
		previousCode: string,
		nextCode: string,
		animationMode: Exclude<CodeAnimationMode, "none">,
	): void {
		this.cancelCodeTransition(refs);
		const animationToken = refs.codeAnimationToken;
		refs.codeEl.empty();
		const transitionEl = refs.codeEl.createSpan({
			cls: `twofa-code-transition twofa-code-transition--${animationMode}`,
		});
		transitionEl.createSpan({
			cls: "twofa-code-transition__layer twofa-code-transition__layer--old",
			text: previousCode,
		});
		transitionEl.createSpan({
			cls: "twofa-code-transition__layer twofa-code-transition__layer--new",
			text: nextCode,
		});

		const animationDurationMs =
			animationMode === "fade"
				? CODE_TRANSITION_FADE_DURATION_MS
				: CODE_TRANSITION_SLIDE_DURATION_MS;
		refs.codeAnimationTimeoutId = this.timerApi.setTimeout(() => {
			if (refs.codeAnimationToken !== animationToken) {
				return;
			}

			refs.codeAnimationTimeoutId = null;
			renderStaticCode(refs.codeEl, nextCode);
		}, animationDurationMs);
	}

	private cancelCodeTransition(refs: EntryRowRefs): void {
		refs.codeAnimationToken += 1;
		if (refs.codeAnimationTimeoutId !== null) {
			this.timerApi.clearTimeout(refs.codeAnimationTimeoutId);
			refs.codeAnimationTimeoutId = null;
		}
	}

	private clearCodeTransitions(): void {
		for (const refs of this.rowRefs.values()) {
			this.cancelCodeTransition(refs);
		}
	}
}
