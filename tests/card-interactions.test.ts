import assert from "node:assert/strict";
import test from "node:test";
import {
	getCardKeyboardAction,
	shouldStartCardLongPress,
	shouldCopyCodeFromCardClick,
} from "../src/ui/views/card-interactions";

test("shouldCopyCodeFromCardClick only allows plain primary clicks", () => {
	assert.equal(
		shouldCopyCodeFromCardClick({
			altKey: false,
			button: 0,
			ctrlKey: false,
			defaultPrevented: false,
			metaKey: false,
			shiftKey: false,
		}),
		true,
	);

	assert.equal(
		shouldCopyCodeFromCardClick({
			altKey: false,
			button: 2,
			ctrlKey: false,
			defaultPrevented: false,
			metaKey: false,
			shiftKey: false,
		}),
		false,
	);

	assert.equal(
		shouldCopyCodeFromCardClick({
			altKey: false,
			button: 0,
			ctrlKey: true,
			defaultPrevented: false,
			metaKey: false,
			shiftKey: false,
		}),
		false,
	);
});

test("getCardKeyboardAction distinguishes copy and menu shortcuts", () => {
	assert.equal(
		getCardKeyboardAction({
			altKey: false,
			ctrlKey: false,
			defaultPrevented: false,
			key: "Enter",
			metaKey: false,
			shiftKey: false,
		}),
		"copy",
	);

	assert.equal(
		getCardKeyboardAction({
			altKey: false,
			ctrlKey: false,
			defaultPrevented: false,
			key: " ",
			metaKey: false,
			shiftKey: false,
		}),
		"copy",
	);

	assert.equal(
		getCardKeyboardAction({
			altKey: false,
			ctrlKey: false,
			defaultPrevented: false,
			key: "ContextMenu",
			metaKey: false,
			shiftKey: false,
		}),
		"menu",
	);

	assert.equal(
		getCardKeyboardAction({
			altKey: false,
			ctrlKey: false,
			defaultPrevented: false,
			key: "F10",
			metaKey: false,
			shiftKey: true,
		}),
		"menu",
	);

	assert.equal(
		getCardKeyboardAction({
			altKey: false,
			ctrlKey: false,
			defaultPrevented: true,
			key: "Enter",
			metaKey: false,
			shiftKey: false,
		}),
		null,
	);
});

test("shouldStartCardLongPress ignores modified clicks and interactive children", () => {
	assert.equal(
		shouldStartCardLongPress({
			altKey: false,
			button: 0,
			ctrlKey: false,
			metaKey: false,
			shiftKey: false,
			target: null,
		}),
		true,
	);

	assert.equal(
		shouldStartCardLongPress({
			altKey: false,
			button: 0,
			ctrlKey: true,
			metaKey: false,
			shiftKey: false,
			target: null,
		}),
		false,
	);

	if (typeof Element === "undefined" || !globalThis.document) {
		return;
	}

	const button = globalThis.document.createElement("button");

	assert.equal(
		shouldStartCardLongPress({
			altKey: false,
			button: 0,
			ctrlKey: false,
			metaKey: false,
			shiftKey: false,
			target: button,
		}),
		false,
	);
});
