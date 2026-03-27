import type { TotpEntryRecord } from "../../types";
import { reorderVisibleEntries } from "./entry-order";
import {
	getEntryDropPlacement,
	TotpManagerViewState,
} from "./totp-manager-view-state";

interface TotpManagerViewDragControllerEnvironment {
	getEntries(): TotpEntryRecord[];
	reorderEntriesByIds(nextOrderedIds: readonly string[]): Promise<void>;
}

interface TotpManagerViewDragControllerCodeRefresh {
	syncDragState(dragState: ReturnType<TotpManagerViewState["getDragState"]>): void;
}

export class TotpManagerViewDragController {
	constructor(
		private readonly environment: TotpManagerViewDragControllerEnvironment,
		private readonly state: TotpManagerViewState,
		private readonly codeRefresh: TotpManagerViewDragControllerCodeRefresh,
	) {}

	handleCardPointerDown(entry: TotpEntryRecord, event: PointerEvent): void {
		this.state.handlePointerDown(entry.id, event, () => {
			if (!this.state.beginDrag(entry.id, event.pointerId)) {
				return;
			}

			this.codeRefresh.syncDragState(this.state.getDragState());
		});
	}

	handleCardPointerMove(
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: PointerEvent,
	): void {
		const thresholdExceededEntryId = this.state.handlePointerMove(event);
		if (
			this.state.isSelectionMode() &&
			!this.state.isDraggingPointer(event.pointerId) &&
			thresholdExceededEntryId
		) {
			if (this.state.beginDrag(thresholdExceededEntryId, event.pointerId)) {
				this.codeRefresh.syncDragState(this.state.getDragState());
			}
		}

		if (!this.state.isDraggingPointer(event.pointerId)) {
			return;
		}

		const placement = getEntryDropPlacement(card.getBoundingClientRect(), event.clientY);
		if (this.state.updateDragTarget(entry.id, placement)) {
			this.codeRefresh.syncDragState(this.state.getDragState());
		}
	}

	async handleCardPointerEnd(
		entry: TotpEntryRecord,
		card: HTMLElement,
		event: PointerEvent,
	): Promise<void> {
		if (!this.state.isDraggingPointer(event.pointerId)) {
			this.state.clearLongPressState(event.pointerId);
			return;
		}

		if (!this.state.getDragState()?.movedIds.includes(entry.id)) {
			const placement = getEntryDropPlacement(card.getBoundingClientRect(), event.clientY);
			if (this.state.updateDragTarget(entry.id, placement)) {
				this.codeRefresh.syncDragState(this.state.getDragState());
			}
		}

		await this.commitPointerDrag(event.pointerId);
	}

	handleCardPointerLeave(event: PointerEvent): void {
		if (this.state.getDragState()) {
			return;
		}

		this.state.clearLongPressState(event.pointerId);
	}

	handleCardPointerCancel(event: PointerEvent): void {
		this.state.clearLongPressState(event.pointerId);
		if (!this.state.isDraggingPointer(event.pointerId)) {
			return;
		}

		this.state.clearDragState(event.pointerId);
		this.codeRefresh.syncDragState(null);
	}

	async handleGlobalPointerEnd(event: PointerEvent): Promise<void> {
		if (!this.state.isDraggingPointer(event.pointerId)) {
			this.state.clearLongPressState(event.pointerId);
			return;
		}

		await this.commitPointerDrag(event.pointerId);
	}

	handleGlobalPointerCancel(event: PointerEvent): void {
		this.state.clearLongPressState(event.pointerId);
		if (!this.state.isDraggingPointer(event.pointerId)) {
			return;
		}

		this.state.clearDragState(event.pointerId);
		this.codeRefresh.syncDragState(null);
	}

	private async commitPointerDrag(pointerId: number): Promise<void> {
		const dragState = this.state.getDragState();

		this.state.clearDragState(pointerId);
		this.codeRefresh.syncDragState(null);

		if (!dragState || dragState.overEntryId === null) {
			return;
		}

		const currentEntries = this.environment.getEntries();
		const nextOrderedIds = reorderVisibleEntries(
			currentEntries,
			this.state.getVisibleEntries().map((visibleEntry) => visibleEntry.id),
			dragState.movedIds,
			dragState.overEntryId,
			dragState.placement,
		);
		const didChange = nextOrderedIds.some(
			(entryId, index) => entryId !== currentEntries[index]?.id,
		);

		if (!didChange) {
			return;
		}

		await this.environment.reorderEntriesByIds(nextOrderedIds);
	}
}
