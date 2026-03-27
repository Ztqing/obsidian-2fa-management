import {
	createTotpDisplaySnapshot,
	type TotpDisplaySnapshot,
} from "../../totp/display";
import {
	createPreparedTotpEntryCache,
	type PreparedTotpEntryCache,
} from "../../totp/totp";
import type { TotpEntryRecord } from "../../types";
import type TwoFactorManagementPlugin from "../../plugin";
import {
	getCodeTransitionPlan,
} from "./code-transition";
import type { DragState } from "./totp-manager-view-state";

const CODE_PLACEHOLDER = "------";

export interface EntryRowRefs {
	cardEl: HTMLElement;
	codeEl: HTMLElement;
	countdownBadgeEl: HTMLElement;
	countdownEl: HTMLElement;
	nextCodeEl: HTMLElement | null;
	nextCodeRowEl: HTMLElement | null;
	activeTransitionEl: HTMLElement | null;
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
			value: TotpDisplaySnapshot;
	  };

interface DragStateSnapshot {
	movedIds: ReadonlySet<string>;
	overEntryId: string | null;
	placement: DragState["placement"];
}

function elementHasClass(element: HTMLElement, className: string): boolean {
	const testElement = element as HTMLElement & {
		hasClass?: (value: string) => boolean;
	};
	if (typeof testElement.hasClass === "function") {
		return testElement.hasClass(className);
	}

	return element.classList?.contains(className) ?? false;
}

function getCodeSegments(value: string): string[] {
	if (!/^[0-9-]+$/.test(value) || value.length <= 4) {
		return [value];
	}

	if (value.length % 2 === 0 && value.length <= 8) {
		const half = value.length / 2;
		return [value.slice(0, half), value.slice(half)];
	}

	const segments: string[] = [];
	for (let index = 0; index < value.length; index += 3) {
		segments.push(value.slice(index, index + 3));
	}
	return segments;
}

export function renderStaticCode(containerEl: HTMLElement, value: string): void {
	containerEl.empty();
	const shouldRenderSegments =
		elementHasClass(containerEl, "twofa-entry-card__code") ||
		elementHasClass(containerEl, "twofa-entry-card__next-code");
	const segments = shouldRenderSegments ? getCodeSegments(value) : [value];

	if (segments.length === 1) {
		containerEl.setText(value);
		return;
	}

	for (const segment of segments) {
		containerEl.createSpan({
			cls: "twofa-code-text__segment",
			text: segment,
		});
	}
}

function setAttributeIfChanged(
	element: HTMLElement,
	name: string,
	value: string,
): void {
	if (element.getAttribute(name) === value) {
		return;
	}

	element.setAttribute(name, value);
}

function setCssPropIfChanged(
	element: HTMLElement,
	name: string,
	value: string,
): void {
	const fakeElement = element as HTMLElement & {
		cssProps?: Record<string, string>;
	};
	if (fakeElement.cssProps?.[name] === value) {
		return;
	}

	element.setCssProps({
		[name]: value,
	});
}

function setTextIfChanged(element: HTMLElement, value: string): void {
	const fakeElement = element as HTMLElement & {
		setText?: (text: string) => void;
		textContent?: string;
	};
	if (fakeElement.textContent === value) {
		return;
	}

	if (typeof fakeElement.setText === "function") {
		fakeElement.setText(value);
		return;
	}

	element.textContent = value;
}

function toggleClassIfChanged(
	element: HTMLElement,
	className: string,
	force: boolean,
): void {
	if (elementHasClass(element, className) === force) {
		return;
	}

	element.toggleClass(className, force);
}

interface TotpCodeRefreshTimerApi {
	clearTimeout: (timerId: number) => void;
	setTimeout: (handler: () => void, timeoutMs: number) => number;
}

interface VisibilityObserverEntry {
	isIntersecting: boolean;
	target: Element;
}

interface VisibilityObserver {
	disconnect(): void;
	observe(target: Element): void;
	unobserve(target: Element): void;
}

export interface TotpCodeRefreshControllerDependencies {
	createDisplaySnapshot?: (
		entry: TotpEntryRecord,
		timestampMs?: number,
		options?: {
			cache?: PreparedTotpEntryCache;
			includeNextCode?: boolean;
			previousSnapshot?: TotpDisplaySnapshot | null;
		},
	) => Promise<TotpDisplaySnapshot>;
	createVisibilityObserver?: (
		callback: (entries: VisibilityObserverEntry[]) => void,
	) => VisibilityObserver | null;
	prepareEntryCache?: PreparedTotpEntryCache;
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

function createWindowVisibilityObserver(
	callback: (entries: VisibilityObserverEntry[]) => void,
): VisibilityObserver | null {
	if (typeof IntersectionObserver !== "function") {
		return null;
	}

	return new IntersectionObserver((entries) => {
		callback(
			entries.map((entry) => ({
				isIntersecting: entry.isIntersecting,
				target: entry.target,
			})),
		);
	});
}

function areSnapshotsEquivalent(
	left: TotpDisplaySnapshot,
	right: TotpDisplaySnapshot,
): boolean {
	return (
		left.currentCode === right.currentCode &&
		left.hasNextCode === right.hasNextCode &&
		left.isRefreshingSoon === right.isRefreshingSoon &&
		left.nextCode === right.nextCode &&
		left.progressPercent === right.progressPercent &&
		left.secondsRemaining === right.secondsRemaining
	);
}

function areCachedDisplaysEquivalent(
	left: CachedEntryDisplay | undefined,
	right: CachedEntryDisplay,
): boolean {
	if (!left || left.kind !== right.kind) {
		return false;
	}

	if (left.kind === "snapshot" && right.kind === "snapshot") {
		return areSnapshotsEquivalent(left.value, right.value);
	}

	return (
		left.kind === "error" &&
		right.kind === "error" &&
		left.label === right.label &&
		left.message === right.message
	);
}

export class TotpCodeRefreshController {
	private readonly rowRefs = new Map<string, EntryRowRefs>();
	private readonly cachedDisplays = new Map<string, CachedEntryDisplay>();
	private readonly entryFingerprintById = new Map<string, string>();
	private readonly observedCardEntryIds = new Map<HTMLElement, string>();
	private readonly viewportEntryIds = new Set<string>();
	private readonly preparedEntryCache: PreparedTotpEntryCache;
	private readonly visibilityObserver: VisibilityObserver | null;
	private visibilityObserverPrimed = false;
	private refreshRun = 0;
	private currentDragState: DragStateSnapshot | null = null;
	private readonly createDisplaySnapshot: NonNullable<
		TotpCodeRefreshControllerDependencies["createDisplaySnapshot"]
	>;
	private readonly shouldReduceMotion: () => boolean;
	private readonly timerApi: TotpCodeRefreshTimerApi;

	constructor(dependencies: TotpCodeRefreshControllerDependencies = {}) {
		this.createDisplaySnapshot =
			dependencies.createDisplaySnapshot ?? createTotpDisplaySnapshot;
		this.preparedEntryCache =
			dependencies.prepareEntryCache ?? createPreparedTotpEntryCache();
		this.visibilityObserver =
			dependencies.createVisibilityObserver?.((entries) => {
				this.handleVisibilityEntries(entries);
			}) ??
			createWindowVisibilityObserver((entries) => {
				this.handleVisibilityEntries(entries);
			});
		this.shouldReduceMotion =
			dependencies.shouldReduceMotion ?? shouldReduceMotionByPreference;
		this.timerApi = dependencies.timerApi ?? createWindowTimerApi();
	}

	registerRow(entry: TotpEntryRecord, refs: EntryRowRefs): void {
		const nextFingerprint = this.preparedEntryCache.getFingerprint(entry);
		const previousFingerprint = this.entryFingerprintById.get(entry.id);

		if (previousFingerprint && previousFingerprint !== nextFingerprint) {
			this.preparedEntryCache.deleteFingerprint(previousFingerprint);
			this.cachedDisplays.delete(entry.id);
		}

		this.rowRefs.set(entry.id, refs);
		this.entryFingerprintById.set(entry.id, nextFingerprint);
		this.observedCardEntryIds.set(refs.cardEl, entry.id);
		this.visibilityObserver?.observe(refs.cardEl);
		if (this.visibilityObserver === null) {
			this.viewportEntryIds.add(entry.id);
		}
		this.applyCachedDisplay(entry.id, refs);
		this.applyDragDecorations(entry.id, refs, this.currentDragState);
	}

	unregisterRow(entryId: string): void {
		const refs = this.rowRefs.get(entryId);
		if (!refs) {
			return;
		}

		this.clearCodeTransition(refs);
		this.visibilityObserver?.unobserve(refs.cardEl);
		this.rowRefs.delete(entryId);
		this.observedCardEntryIds.delete(refs.cardEl);
		this.viewportEntryIds.delete(entryId);
	}

	resetRows(): void {
		this.clearCodeTransitions();
		for (const refs of this.rowRefs.values()) {
			this.visibilityObserver?.unobserve(refs.cardEl);
		}
		this.rowRefs.clear();
		this.observedCardEntryIds.clear();
		this.viewportEntryIds.clear();
		this.visibilityObserverPrimed = false;
		this.currentDragState = null;
	}

	clearSensitiveState(): void {
		this.clearCodeTransitions();
		this.cachedDisplays.clear();
		this.entryFingerprintById.clear();
		this.preparedEntryCache.clear();
		for (const refs of this.rowRefs.values()) {
			this.applyPlaceholderState(refs);
		}
	}

	destroy(): void {
		this.resetRows();
		this.clearSensitiveState();
		this.visibilityObserver?.disconnect();
	}

	syncDragState(dragState: DragState | null): void {
		const nextDragState = dragState
			? {
					movedIds: new Set(dragState.movedIds),
					overEntryId: dragState.overEntryId,
					placement: dragState.placement,
				}
			: null;
		const dirtyIds = new Set<string>();

		if (this.currentDragState) {
			for (const entryId of this.currentDragState.movedIds) {
				dirtyIds.add(entryId);
			}
			if (this.currentDragState.overEntryId) {
				dirtyIds.add(this.currentDragState.overEntryId);
			}
		}

		if (nextDragState) {
			for (const entryId of nextDragState.movedIds) {
				dirtyIds.add(entryId);
			}
			if (nextDragState.overEntryId) {
				dirtyIds.add(nextDragState.overEntryId);
			}
		}

		for (const entryId of dirtyIds) {
			const refs = this.rowRefs.get(entryId);
			if (!refs) {
				continue;
			}

			this.applyDragDecorations(entryId, refs, nextDragState);
		}

		this.currentDragState = nextDragState;
	}

	async refreshVisibleCodes(
		plugin: Pick<TwoFactorManagementPlugin, "getErrorMessage" | "isUnlocked" | "t">,
		visibleEntries: readonly TotpEntryRecord[],
		options: {
			showUpcomingCodes?: boolean;
		} = {},
	): Promise<void> {
		if (!plugin.isUnlocked()) {
			this.clearSensitiveState();
			return;
		}

		if (visibleEntries.length === 0) {
			return;
		}

		const includeNextCode = options.showUpcomingCodes ?? true;
		const timestampMs = Date.now();
		const currentRun = this.refreshRun + 1;
		this.refreshRun = currentRun;
		const refreshEntries = visibleEntries.filter((entry) => {
			if (!this.rowRefs.has(entry.id)) {
				return false;
			}

			return (
				this.visibilityObserver === null ||
				!this.visibilityObserverPrimed ||
				this.viewportEntryIds.has(entry.id)
			);
		});

		if (refreshEntries.length === 0) {
			return;
		}

		const snapshots = await Promise.all(
			refreshEntries.map(async (entry) => {
				const cachedDisplay = this.cachedDisplays.get(entry.id);
				const cachedSnapshot =
					cachedDisplay?.kind === "snapshot" ? cachedDisplay.value : null;

				try {
					return {
						entryId: entry.id,
						error: null,
						snapshot: await this.createDisplaySnapshot(entry, timestampMs, {
							cache: this.preparedEntryCache,
							includeNextCode,
							previousSnapshot: cachedSnapshot,
						}),
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
				const nextDisplay: CachedEntryDisplay = {
					kind: "snapshot",
					value: result.snapshot,
				};
				if (
					areCachedDisplaysEquivalent(
						this.cachedDisplays.get(result.entryId),
						nextDisplay,
					)
				) {
					continue;
				}

				this.cachedDisplays.set(result.entryId, nextDisplay);
				this.applySnapshot(refs, result.snapshot, {
					countdownLabel: plugin.t("view.entry.countdown", {
						seconds: result.snapshot.secondsRemaining,
					}),
				});
				continue;
			}

			const errorMessage = result.error ?? plugin.t("view.entry.refreshFallback");
			const nextDisplay: CachedEntryDisplay = {
				kind: "error",
				label: plugin.t("view.entry.error"),
				message: errorMessage,
			};
			if (
				areCachedDisplaysEquivalent(
					this.cachedDisplays.get(result.entryId),
					nextDisplay,
				)
			) {
				continue;
			}

			this.cachedDisplays.set(result.entryId, nextDisplay);
			this.applyErrorState(refs, {
				errorLabel: plugin.t("view.entry.error"),
				errorMessage,
			});
		}
	}

	private handleVisibilityEntries(entries: VisibilityObserverEntry[]): void {
		if (entries.length > 0) {
			this.visibilityObserverPrimed = true;
		}

		for (const entry of entries) {
			const entryId = this.observedCardEntryIds.get(entry.target as HTMLElement);
			if (!entryId) {
				continue;
			}

			if (entry.isIntersecting) {
				this.viewportEntryIds.add(entryId);
				continue;
			}

			this.viewportEntryIds.delete(entryId);
		}
	}

	private applyCachedDisplay(entryId: string, refs: EntryRowRefs): void {
		const cachedDisplay = this.cachedDisplays.get(entryId);
		if (!cachedDisplay) {
			return;
		}

		if (cachedDisplay.kind === "snapshot") {
			this.applySnapshot(refs, cachedDisplay.value, {
				disableAnimation: true,
				countdownLabel: `view.entry.countdown:${JSON.stringify({
					seconds: cachedDisplay.value.secondsRemaining,
				})}`,
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
			disableAnimation?: boolean;
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
			options.disableAnimation ? "none" : transitionPlan.currentAnimationMode,
			transitionPlan,
		);
		toggleClassIfChanged(refs.codeEl, "is-error", false);
		setTextIfChanged(refs.countdownEl, String(snapshot.secondsRemaining));
		setAttributeIfChanged(
			refs.countdownBadgeEl,
			"aria-label",
			options.countdownLabel,
		);
		setCssPropIfChanged(
			refs.countdownBadgeEl,
			"--countdown-progress",
			`${snapshot.progressPercent.toFixed(2)}%`,
		);
		toggleClassIfChanged(refs.countdownBadgeEl, "is-error", false);
		toggleClassIfChanged(
			refs.countdownBadgeEl,
			"is-warning",
			snapshot.isRefreshingSoon,
		);

		if (refs.nextCodeEl) {
			renderStaticCode(
				refs.nextCodeEl,
				snapshot.hasNextCode === false ? CODE_PLACEHOLDER : snapshot.nextCode,
			);
		}
		this.setNextCodeVisibility(refs, refs.nextCodeRowEl !== null);

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
		toggleClassIfChanged(refs.codeEl, "is-error", true);
		setTextIfChanged(refs.countdownEl, "!");
		setCssPropIfChanged(refs.countdownBadgeEl, "--countdown-progress", "0%");
		toggleClassIfChanged(refs.countdownBadgeEl, "is-warning", false);
		toggleClassIfChanged(refs.countdownBadgeEl, "is-error", true);
		setAttributeIfChanged(
			refs.countdownBadgeEl,
			"aria-label",
			options.errorMessage,
		);

		if (refs.nextCodeEl) {
			renderStaticCode(refs.nextCodeEl, CODE_PLACEHOLDER);
		}
		this.setNextCodeVisibility(refs, refs.nextCodeRowEl !== null);
	}

	private applyPlaceholderState(refs: EntryRowRefs): void {
		this.setCurrentCodeText(refs, CODE_PLACEHOLDER);
		toggleClassIfChanged(refs.codeEl, "is-error", false);
		setTextIfChanged(refs.countdownEl, "...");
		toggleClassIfChanged(refs.countdownBadgeEl, "is-error", false);
		toggleClassIfChanged(refs.countdownBadgeEl, "is-warning", false);
		setCssPropIfChanged(refs.countdownBadgeEl, "--countdown-progress", "0%");

		if (refs.nextCodeEl) {
			renderStaticCode(refs.nextCodeEl, CODE_PLACEHOLDER);
		}
		this.setNextCodeVisibility(refs, refs.nextCodeRowEl !== null);
	}

	private updateCurrentCodeDisplay(
		refs: EntryRowRefs,
		value: string,
		animationMode: "none" | "roll",
		transitionPlan: ReturnType<typeof getCodeTransitionPlan>,
	): void {
		this.clearCodeTransition(refs);

		if (animationMode === "none") {
			this.setCurrentCodeText(refs, value);
			return;
		}

		const previousValue = refs.previousCurrentCode ?? CODE_PLACEHOLDER;
		refs.codeEl.empty();
		const transitionEl = refs.codeEl.createDiv({
			cls: "twofa-code-transition",
		});
		transitionEl.addClass("twofa-code-transition--roll");

		for (const segment of transitionPlan.segments) {
			const segmentEl = transitionEl.createSpan({
				cls: "twofa-code-transition__segment",
			});
			segmentEl.setCssProps({
				"--twofa-code-delay": `${segment.delayMs}ms`,
			});
			if (!segment.shouldAnimate) {
				segmentEl.addClass("is-static");
				segmentEl.setText(segment.nextCharacter);
				continue;
			}

			segmentEl.createSpan({
				cls: "twofa-code-transition__digit twofa-code-transition__digit--old",
				text: segment.previousCharacter || previousValue[segment.index] || "",
			});
			segmentEl.createSpan({
				cls: "twofa-code-transition__digit twofa-code-transition__digit--new",
				text: segment.nextCharacter,
			});
		}
		refs.activeTransitionEl = transitionEl;
		const animationToken = refs.codeAnimationToken + 1;
		refs.codeAnimationToken = animationToken;
		refs.codeAnimationTimeoutId = this.timerApi.setTimeout(() => {
			if (refs.codeAnimationToken !== animationToken) {
				return;
			}

			refs.codeAnimationTimeoutId = null;
			refs.activeTransitionEl = null;
			this.setCurrentCodeText(refs, value);
		}, transitionPlan.totalDurationMs);
	}

	private setCurrentCodeText(refs: EntryRowRefs, value: string): void {
		if (
			refs.activeTransitionEl === null &&
			refs.codeEl.textContent === value &&
			refs.previousCurrentCode === (value === CODE_PLACEHOLDER ? null : value)
		) {
			return;
		}

		refs.activeTransitionEl = null;
		refs.previousCurrentCode = value === CODE_PLACEHOLDER ? null : value;
		renderStaticCode(refs.codeEl, value);
	}

	private setNextCodeVisibility(refs: EntryRowRefs, isVisible: boolean): void {
		refs.nextCodeRowEl?.toggleClass("is-visible", isVisible);
	}

	private clearCodeTransitions(): void {
		for (const refs of this.rowRefs.values()) {
			this.clearCodeTransition(refs);
		}
	}

	private clearCodeTransition(refs: EntryRowRefs): void {
		if (refs.codeAnimationTimeoutId !== null) {
			this.timerApi.clearTimeout(refs.codeAnimationTimeoutId);
			refs.codeAnimationTimeoutId = null;
		}

		if (refs.activeTransitionEl !== null) {
			this.setCurrentCodeText(refs, refs.previousCurrentCode ?? CODE_PLACEHOLDER);
		}
	}

	private applyDragDecorations(
		entryId: string,
		refs: EntryRowRefs,
		dragState: DragStateSnapshot | null,
	): void {
		const isDragging = dragState?.movedIds.has(entryId) ?? false;
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
