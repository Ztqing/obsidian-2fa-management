import type { TotpEntryRecord } from "../../types";

export type EntryDropPlacement = "before" | "after";

export function reorderVisibleEntries(
	entries: readonly TotpEntryRecord[],
	visibleEntryIds: readonly string[],
	movedEntryIds: readonly string[],
	targetEntryId: string | null,
	placement: EntryDropPlacement,
): string[] {
	const orderedEntryIds = entries.map((entry) => entry.id);
	const visibleIdSet = new Set(visibleEntryIds);
	const movingIdSet = new Set(movedEntryIds.filter((entryId) => visibleIdSet.has(entryId)));

	if (movingIdSet.size === 0) {
		return orderedEntryIds;
	}

	if (targetEntryId && movingIdSet.has(targetEntryId)) {
		return orderedEntryIds;
	}

	const visibleOrderedIds = orderedEntryIds.filter((entryId) => visibleIdSet.has(entryId));
	const movingVisibleIds = visibleOrderedIds.filter((entryId) => movingIdSet.has(entryId));
	const stationaryVisibleIds = visibleOrderedIds.filter((entryId) => !movingIdSet.has(entryId));
	let insertionIndex = stationaryVisibleIds.length;

	if (targetEntryId) {
		const targetIndex = stationaryVisibleIds.indexOf(targetEntryId);

		if (targetIndex !== -1) {
			insertionIndex = placement === "after" ? targetIndex + 1 : targetIndex;
		}
	}

	const reorderedVisibleIds = [
		...stationaryVisibleIds.slice(0, insertionIndex),
		...movingVisibleIds,
		...stationaryVisibleIds.slice(insertionIndex),
	];
	const nextOrderedIds: string[] = [];
	let reorderedVisibleIndex = 0;

	for (const entryId of orderedEntryIds) {
		if (!visibleIdSet.has(entryId)) {
			nextOrderedIds.push(entryId);
			continue;
		}

		const nextVisibleId = reorderedVisibleIds[reorderedVisibleIndex];

		if (!nextVisibleId) {
			continue;
		}

		nextOrderedIds.push(nextVisibleId);
		reorderedVisibleIndex += 1;
	}

	return nextOrderedIds;
}
