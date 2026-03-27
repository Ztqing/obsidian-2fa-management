import type { ItemView } from "obsidian";

export function bindViewSessionActivity(
	view: Pick<ItemView, "registerDomEvent">,
	rootEl: HTMLElement,
	onActivity: () => void,
): void {
	for (const eventName of ["change", "input", "keydown", "pointerdown"] as const) {
		view.registerDomEvent(rootEl, eventName, () => {
			onActivity();
		});
	}
}
