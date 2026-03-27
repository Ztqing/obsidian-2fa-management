import assert from "node:assert/strict";
import test from "node:test";
import {
	refreshManagedViews,
	toViewRenderMode,
} from "../src/plugin/internal/view-refresh";

test("toViewRenderMode keeps plugin invalidation mapping stable", () => {
	assert.equal(toViewRenderMode("availability"), "availability");
	assert.equal(toViewRenderMode("entries"), "entries");
	assert.equal(toViewRenderMode("search"), "search");
	assert.equal(toViewRenderMode("selection"), "body");
	assert.equal(toViewRenderMode("full"), "full");
});

test("refreshManagedViews only refreshes matching leaves and tolerates rejected refreshes", async () => {
	const refreshedModes: string[] = [];

	await refreshManagedViews(
		[
			{
				view: {
					refresh: async (mode: string) => {
						refreshedModes.push(`first:${mode}`);
					},
				},
			},
			{
				view: {
					refresh: async () => {
						throw new Error("refresh failed");
					},
				},
			},
			{
				view: {},
			},
		] as never,
		"selection",
		(view) => typeof (view as { refresh?: unknown }).refresh === "function",
	);

	assert.deepEqual(refreshedModes, ["first:body"]);
});
