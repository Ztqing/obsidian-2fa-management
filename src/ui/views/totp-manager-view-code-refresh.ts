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
	}

	resetRows(): void {
		this.clearCodeTransitions();
		this.rowRefs.clear();
	}

	destroy(): void {
		this.resetRows();
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
				const transitionPlan = getCodeTransitionPlan({
					nextCurrentCode: result.snapshot.currentCode,
					previousCurrentCode: refs.previousCurrentCode,
					reducedMotion: this.shouldReduceMotion(),
				});

				this.updateCurrentCodeDisplay(
					refs,
					result.snapshot.currentCode,
					transitionPlan.currentAnimationMode,
				);
				refs.codeEl.removeClass("is-error");
				refs.countdownEl.setText(String(result.snapshot.secondsRemaining));
				refs.countdownBadgeEl.setAttribute(
					"aria-label",
					plugin.t("view.entry.countdown", {
						seconds: result.snapshot.secondsRemaining,
					}),
				);
				refs.countdownBadgeEl.setCssProps({
					"--countdown-progress": `${result.snapshot.progressPercent.toFixed(2)}%`,
				});
				refs.countdownBadgeEl.removeClass("is-error");
				refs.countdownBadgeEl.toggleClass(
					"is-warning",
					result.snapshot.isRefreshingSoon,
				);
				if (refs.nextCodeEl) {
					renderStaticCode(refs.nextCodeEl, result.snapshot.nextCode);
				}
				refs.previousCurrentCode = result.snapshot.currentCode;
				continue;
			}

			this.setCurrentCodeText(refs, plugin.t("view.entry.error"));
			refs.codeEl.addClass("is-error");
			refs.countdownEl.setText("!");
			refs.countdownBadgeEl.setCssProps({
				"--countdown-progress": "0%",
			});
			refs.countdownBadgeEl.removeClass("is-warning");
			refs.countdownBadgeEl.addClass("is-error");
			refs.countdownBadgeEl.setAttribute(
				"aria-label",
				result.error ?? plugin.t("view.entry.refreshFallback"),
			);
			if (refs.nextCodeEl) {
				renderStaticCode(refs.nextCodeEl, "------");
			}
			refs.previousCurrentCode = null;
		}
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
