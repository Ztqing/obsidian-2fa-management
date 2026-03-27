import type { WorkspaceLeaf } from "obsidian";
import type { ViewInvalidationMode } from "../../application/contracts";
import type { TotpManagerViewRenderMode } from "../../ui/views/totp-manager-view-renderer";

export function toViewRenderMode(
	mode: ViewInvalidationMode,
): TotpManagerViewRenderMode {
	switch (mode) {
		case "availability":
			return "availability";
		case "entries":
			return "entries";
		case "search":
			return "search";
		case "selection":
			return "body";
		case "full":
		default:
			return "full";
	}
}

export async function refreshManagedViews(
	leaves: WorkspaceLeaf[],
	mode: ViewInvalidationMode,
	isRefreshableView: (view: WorkspaceLeaf["view"]) => boolean,
): Promise<void> {
	const renderMode = toViewRenderMode(mode);
	await Promise.allSettled(
		leaves.map(async (leaf) => {
			if (isRefreshableView(leaf.view)) {
				await (
					leaf.view as WorkspaceLeaf["view"] & {
						refresh(mode: TotpManagerViewRenderMode): Promise<void>;
					}
				).refresh(renderMode);
			}
		}),
	);
}
