import assert from "node:assert/strict";
import test from "node:test";
import { getCodeTransitionPlan } from "../src/ui/views/code-transition";

test("getCodeTransitionPlan does not animate on the first render", () => {
	const plan = getCodeTransitionPlan({
		previousCurrentCode: null,
		nextCurrentCode: "123456",
	});

	assert.equal(plan.isFirstRender, true);
	assert.equal(plan.shouldAnimateCurrentCode, false);
	assert.equal(plan.currentAnimationMode, "none");
});

test("getCodeTransitionPlan does not animate when the current code is unchanged", () => {
	const plan = getCodeTransitionPlan({
		previousCurrentCode: "123456",
		nextCurrentCode: "123456",
	});

	assert.equal(plan.isFirstRender, false);
	assert.equal(plan.shouldAnimateCurrentCode, false);
	assert.equal(plan.currentAnimationMode, "none");
});

test("getCodeTransitionPlan animates the current code with slide motion when it changes", () => {
	const plan = getCodeTransitionPlan({
		previousCurrentCode: "123456",
		nextCurrentCode: "654321",
	});

	assert.equal(plan.isFirstRender, false);
	assert.equal(plan.shouldAnimateCurrentCode, true);
	assert.equal(plan.currentAnimationMode, "slide");
});

test("getCodeTransitionPlan still animates when formatted code strings change", () => {
	const plan = getCodeTransitionPlan({
		previousCurrentCode: "123 456",
		nextCurrentCode: "234 567",
	});

	assert.equal(plan.shouldAnimateCurrentCode, true);
	assert.equal(plan.currentAnimationMode, "slide");
});

test("getCodeTransitionPlan downgrades animation mode under reduced motion", () => {
	const plan = getCodeTransitionPlan({
		previousCurrentCode: "123456",
		nextCurrentCode: "123556",
		reducedMotion: true,
	});

	assert.equal(plan.shouldAnimateCurrentCode, true);
	assert.equal(plan.currentAnimationMode, "fade");
});
