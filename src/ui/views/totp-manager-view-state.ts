import { shouldStartCardLongPress } from "./card-interactions";
import type { TotpEntryRecord } from "../../types";
import type { EntryDropPlacement } from "./entry-order";

const LONG_PRESS_DELAY_MS = 350;
const LONG_PRESS_MOVE_THRESHOLD_PX = 8;

export interface DragState {
	movedIds: string[];
	overEntryId: string | null;
	placement: EntryDropPlacement;
}

export interface TimerApi {
	clearTimeout: (timerId: number) => void;
	setTimeout: (handler: () => void, timeoutMs: number) => number;
}

function createWindowTimerApi(): TimerApi {
	return {
		clearTimeout: (timerId) => {
			window.clearTimeout(timerId);
		},
		setTimeout: (handler, timeoutMs) => window.setTimeout(handler, timeoutMs),
	};
}

export function getEntryDropPlacement(
	bounds: Pick<DOMRect, "height" | "top">,
	clientY: number,
): EntryDropPlacement {
	return clientY >= bounds.top + bounds.height / 2 ? "after" : "before";
}

export class TotpManagerViewState {
	private searchQuery = "";
	private visibleEntries: TotpEntryRecord[] = [];
	private readonly searchTextByEntryId = new Map<string, string>();
	private isSelectionModeActive = false;
	private selectedEntryIds = new Set<string>();
	private longPressTimer: number | null = null;
	private longPressPointerId: number | null = null;
	private longPressEntryId: string | null = null;
	private longPressStartX = 0;
	private longPressStartY = 0;
	private suppressedClickEntryId: string | null = null;
	private dragState: DragState | null = null;
	private dragPointerId: number | null = null;

	constructor(private readonly timerApi: TimerApi = createWindowTimerApi()) {}

	getSearchQuery(): string {
		return this.searchQuery;
	}

	setSearchQuery(query: string, entries: readonly TotpEntryRecord[]): void {
		this.searchQuery = query;
		this.syncEntries(entries);
	}

	syncEntries(entries: readonly TotpEntryRecord[]): void {
		this.syncSearchIndex(entries);
		this.visibleEntries = this.filterEntries(entries, this.searchQuery);
		this.pruneSelectionToExistingEntries(entries);
	}

	resetForUnavailableVault(): void {
		this.visibleEntries = [];
		this.isSelectionModeActive = false;
		this.selectedEntryIds.clear();
		this.clearLongPressState();
		this.clearDragState();
		this.suppressedClickEntryId = null;
	}

	getVisibleEntries(): TotpEntryRecord[] {
		return [...this.visibleEntries];
	}

	isSelectionMode(): boolean {
		return this.isSelectionModeActive;
	}

	getSelectedCount(): number {
		return this.selectedEntryIds.size;
	}

	isEntrySelected(entryId: string): boolean {
		return this.selectedEntryIds.has(entryId);
	}

	getSelectedEntries(entries: readonly TotpEntryRecord[]): TotpEntryRecord[] {
		return entries.filter((entry) => this.selectedEntryIds.has(entry.id));
	}

	getSingleSelectedEntry(entries: readonly TotpEntryRecord[]): TotpEntryRecord | null {
		if (this.selectedEntryIds.size !== 1) {
			return null;
		}

		const [selectedEntryId] = [...this.selectedEntryIds];
		return entries.find((entry) => entry.id === selectedEntryId) ?? null;
	}

	getSelectedVisibleEntryIds(): string[] {
		return this.visibleEntries
			.filter((entry) => this.selectedEntryIds.has(entry.id))
			.map((entry) => entry.id);
	}

	selectAllVisibleEntries(): void {
		this.selectedEntryIds = new Set([
			...this.selectedEntryIds,
			...this.visibleEntries.map((entry) => entry.id),
		]);
	}

	clearVisibleEntrySelection(): void {
		const visibleIds = new Set(this.visibleEntries.map((entry) => entry.id));
		this.selectedEntryIds = new Set(
			[...this.selectedEntryIds].filter((entryId) => !visibleIds.has(entryId)),
		);
	}

	areAllVisibleEntriesSelected(): boolean {
		return (
			this.visibleEntries.length > 0 &&
			this.visibleEntries.every((entry) => this.selectedEntryIds.has(entry.id))
		);
	}

	enterSelectionMode(entryId?: string): void {
		this.isSelectionModeActive = true;
		this.selectedEntryIds =
			typeof entryId === "string" ? new Set([entryId]) : new Set();
		this.clearLongPressState();
	}

	exitSelectionMode(): void {
		this.isSelectionModeActive = false;
		this.selectedEntryIds.clear();
		this.clearLongPressState();
		this.clearDragState();
	}

	toggleEntrySelection(entryId: string): void {
		const nextSelection = new Set(this.selectedEntryIds);

		if (nextSelection.has(entryId)) {
			nextSelection.delete(entryId);
		} else {
			nextSelection.add(entryId);
		}

		this.selectedEntryIds = nextSelection;
	}

	removeEntriesFromSelection(
		entries: readonly TotpEntryRecord[],
		remainingEntryCount: number,
	): void {
		for (const entry of entries) {
			this.selectedEntryIds.delete(entry.id);
		}

		if (remainingEntryCount === 0) {
			this.isSelectionModeActive = false;
		}
	}

	setSelectedEntryIds(entryIds: readonly string[]): void {
		this.selectedEntryIds = new Set(entryIds);
	}

	consumeSuppressedClick(entryId: string): boolean {
		if (this.suppressedClickEntryId !== entryId) {
			return false;
		}

		this.suppressedClickEntryId = null;
		return true;
	}

	handlePointerDown(
		entryId: string,
		event: PointerEvent,
		onLongPress: () => void,
		options: {
			force?: boolean;
		} = {},
	): void {
		if (!options.force && !shouldStartCardLongPress(event)) {
			return;
		}

		this.clearLongPressState();
		this.longPressPointerId = event.pointerId;
		this.longPressEntryId = entryId;
		this.longPressStartX = event.clientX;
		this.longPressStartY = event.clientY;
		this.longPressTimer = this.timerApi.setTimeout(() => {
			this.longPressTimer = null;
			this.suppressedClickEntryId = entryId;
			onLongPress();
		}, LONG_PRESS_DELAY_MS);
	}

	handlePointerMove(event: PointerEvent): string | null {
		if (this.longPressPointerId !== event.pointerId) {
			return null;
		}

		const deltaX = event.clientX - this.longPressStartX;
		const deltaY = event.clientY - this.longPressStartY;

		if (Math.hypot(deltaX, deltaY) > LONG_PRESS_MOVE_THRESHOLD_PX) {
			const pendingEntryId = this.longPressEntryId;
			this.clearLongPressState();
			return pendingEntryId;
		}

		return null;
	}

	clearLongPressState(pointerId?: number): void {
		if (
			typeof pointerId === "number" &&
			this.longPressPointerId !== null &&
			this.longPressPointerId !== pointerId
		) {
			return;
		}

		if (this.longPressTimer !== null) {
			this.timerApi.clearTimeout(this.longPressTimer);
			this.longPressTimer = null;
		}

		this.longPressPointerId = null;
		this.longPressEntryId = null;
	}

	beginDrag(entryId: string, pointerId?: number): string[] | null {
		this.clearLongPressState();
		this.suppressedClickEntryId = entryId;
		const movedIds = this.selectedEntryIds.has(entryId)
			? this.getSelectedVisibleEntryIds()
			: [entryId];

		this.dragState = {
			movedIds,
			overEntryId: null,
			placement: "before",
		};
		this.dragPointerId = pointerId ?? null;

		return [...movedIds];
	}

	isDraggingPointer(pointerId: number): boolean {
		return this.dragState !== null && this.dragPointerId === pointerId;
	}

	updateDragTarget(entryId: string, placement: EntryDropPlacement): boolean {
		if (!this.dragState || this.dragState.movedIds.includes(entryId)) {
			return false;
		}

		if (
			this.dragState.overEntryId === entryId &&
			this.dragState.placement === placement
		) {
			return false;
		}

		this.dragState = {
			...this.dragState,
			overEntryId: entryId,
			placement,
		};
		return true;
	}

	getDragState(): DragState | null {
		if (!this.dragState) {
			return null;
		}

		return {
			...this.dragState,
			movedIds: [...this.dragState.movedIds],
		};
	}

	clearDragState(pointerId?: number): void {
		if (
			typeof pointerId === "number" &&
			this.dragPointerId !== null &&
			this.dragPointerId !== pointerId
		) {
			return;
		}

		this.dragState = null;
		this.dragPointerId = null;
	}

	private pruneSelectionToExistingEntries(entries: readonly TotpEntryRecord[]): void {
		const existingIds = new Set(entries.map((entry) => entry.id));
		this.selectedEntryIds = new Set(
			[...this.selectedEntryIds].filter((entryId) => existingIds.has(entryId)),
		);
	}

	private filterEntries(
		entries: readonly TotpEntryRecord[],
		query: string,
	): TotpEntryRecord[] {
		const normalizedQuery = this.normalizeSearchText(query);
		if (normalizedQuery.length === 0) {
			return [...entries];
		}

		return entries.filter((entry) => {
			return (this.searchTextByEntryId.get(entry.id) ?? "").includes(normalizedQuery);
		});
	}

	private syncSearchIndex(entries: readonly TotpEntryRecord[]): void {
		const existingIds = new Set<string>();

		for (const entry of entries) {
			existingIds.add(entry.id);
			this.searchTextByEntryId.set(entry.id, this.createSearchText(entry));
		}

		for (const entryId of this.searchTextByEntryId.keys()) {
			if (!existingIds.has(entryId)) {
				this.searchTextByEntryId.delete(entryId);
			}
		}
	}

	private createSearchText(entry: Pick<TotpEntryRecord, "accountName" | "issuer">): string {
		return this.normalizeSearchText(`${entry.issuer} ${entry.accountName}`);
	}

	private normalizeSearchText(value: string): string {
		return value.trim().toLocaleLowerCase();
	}
}
