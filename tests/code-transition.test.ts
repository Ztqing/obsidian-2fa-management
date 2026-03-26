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
	assert.equal(plan.totalDurationMs, 0);
	assert.deepEqual(
		plan.segments.map((segment) => segment.shouldAnimate),
		[false, false, false, false, false, false],
	);
});

test("getCodeTransitionPlan does not animate when the current code is unchanged", () => {
	const plan = getCodeTransitionPlan({
		previousCurrentCode: "123456",
		nextCurrentCode: "123456",
	});

	assert.equal(plan.isFirstRender, false);
	assert.equal(plan.shouldAnimateCurrentCode, false);
	assert.equal(plan.currentAnimationMode, "none");
	assert.equal(plan.totalDurationMs, 0);
});

test("getCodeTransitionPlan animates only the changed digits with rolling motion", () => {
	const plan = getCodeTransitionPlan({
		previousCurrentCode: "123456",
		nextCurrentCode: "129556",
	});

	assert.equal(plan.isFirstRender, false);
	assert.equal(plan.shouldAnimateCurrentCode, true);
	assert.equal(plan.currentAnimationMode, "roll");
	assert.deepEqual(
		plan.segments.map((segment) => segment.shouldAnimate),
		[false, false, true, true, false, false],
	);
	assert.deepEqual(
		plan.segments.filter((segment) => segment.shouldAnimate).map((segment) => segment.delayMs),
		[0, 18],
	);
});

test("getCodeTransitionPlan still animates when formatted code strings change", () => {
	const plan = getCodeTransitionPlan({
		previousCurrentCode: "123 456",
		nextCurrentCode: "124 456",
	});

	assert.equal(plan.shouldAnimateCurrentCode, true);
	assert.equal(plan.currentAnimationMode, "roll");
	assert.deepEqual(
		plan.segments.map((segment) => segment.shouldAnimate),
		[false, false, true, false, false, false, false],
	);
});

test("getCodeTransitionPlan disables animation under reduced motion", () => {
	const plan = getCodeTransitionPlan({
		previousCurrentCode: "123456",
		nextCurrentCode: "123556",
		reducedMotion: true,
	});

	assert.equal(plan.shouldAnimateCurrentCode, true);
	assert.equal(plan.currentAnimationMode, "none");
	assert.equal(plan.totalDurationMs, 0);
	assert.ok(plan.segments.every((segment) => segment.shouldAnimate === false));
});
