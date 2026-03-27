export function bindModalSessionActivity(
	rootEl: HTMLElement,
	onActivity: () => void,
): void {
	const events = ["change", "input", "keydown", "pointerdown"] as const;

	for (const eventName of events) {
		rootEl.addEventListener(eventName, () => {
			onActivity();
		});
	}
}
