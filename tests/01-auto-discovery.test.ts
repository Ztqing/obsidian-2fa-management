import assert from "node:assert/strict";
import test from "node:test";

test("test index automatically discovers sibling test files", () => {
	assert.equal(globalThis.__TWOFA_AUTO_DISCOVERY_SENTINEL__, true);
});
