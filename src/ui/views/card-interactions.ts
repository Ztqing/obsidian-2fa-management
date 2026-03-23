export interface CardClickIntent {
	altKey: boolean;
	button: number;
	ctrlKey: boolean;
	defaultPrevented: boolean;
	metaKey: boolean;
	shiftKey: boolean;
}

export interface CardKeyboardIntent {
	altKey: boolean;
	ctrlKey: boolean;
	defaultPrevented: boolean;
	key: string;
	metaKey: boolean;
	shiftKey: boolean;
}

export interface CardPointerIntent {
	altKey: boolean;
	button: number;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
	target: EventTarget | null;
}

export type CardKeyboardAction = "copy" | "menu" | null;

const INTERACTIVE_SELECTOR = "button, input, textarea, select, a";

export function shouldCopyCodeFromCardClick(intent: CardClickIntent): boolean {
	return (
		!intent.defaultPrevented &&
		intent.button === 0 &&
		!intent.altKey &&
		!intent.ctrlKey &&
		!intent.metaKey &&
		!intent.shiftKey
	);
}

export function getCardKeyboardAction(intent: CardKeyboardIntent): CardKeyboardAction {
	if (intent.defaultPrevented || intent.altKey || intent.ctrlKey || intent.metaKey) {
		return null;
	}

	if (intent.key === "Enter" || intent.key === " " || intent.key === "Spacebar") {
		return "copy";
	}

	if (intent.key === "ContextMenu" || (intent.shiftKey && intent.key === "F10")) {
		return "menu";
	}

	return null;
}

export function shouldStartCardLongPress(intent: CardPointerIntent): boolean {
	if (
		intent.button !== 0 ||
		intent.altKey ||
		intent.ctrlKey ||
		intent.metaKey ||
		intent.shiftKey
	) {
		return false;
	}

	return !isInteractiveCardTarget(intent.target);
}

export function isInteractiveCardTarget(target: EventTarget | null): boolean {
	return (
		typeof Element !== "undefined" &&
		target instanceof Element &&
		target.closest(INTERACTIVE_SELECTOR) !== null
	);
}
