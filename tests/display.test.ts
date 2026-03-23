import assert from "node:assert/strict";
import test from "node:test";
import { normalizePluginData } from "../src/data/store";
import { createTotpDisplaySnapshot } from "../src/totp/display";
import { generateTotpCode } from "../src/totp/totp";

const fixtureEntry = {
	secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
	algorithm: "SHA-1" as const,
	digits: 8,
	period: 30,
};

test("normalizePluginData defaults view toggles when settings are missing", () => {
	assert.equal(normalizePluginData({}).settings.showUpcomingCodes, false);
	assert.equal(normalizePluginData({}).settings.showFloatingLockButton, true);
	assert.equal(
		normalizePluginData({
			settings: {
				showUpcomingCodes: true,
			},
		}).settings.showUpcomingCodes,
		true,
	);
	assert.equal(
		normalizePluginData({
			settings: {
				showUpcomingCodes: "yes",
			},
		}).settings.showUpcomingCodes,
		false,
	);
	assert.equal(
		normalizePluginData({
			settings: {
				showFloatingLockButton: false,
			},
		}).settings.showFloatingLockButton,
		false,
	);
	assert.equal(
		normalizePluginData({
			settings: {
				showFloatingLockButton: "no",
			},
		}).settings.showFloatingLockButton,
		true,
	);
});

test("createTotpDisplaySnapshot includes the next code and refresh progress", async () => {
	const snapshot = await createTotpDisplaySnapshot(fixtureEntry, 59_000);

	assert.equal(snapshot.currentCode, "94287082");
	assert.equal(snapshot.secondsRemaining, 1);
	assert.equal(snapshot.isRefreshingSoon, true);
	assert.ok(snapshot.progressPercent > 96);
	assert.equal(snapshot.nextCode, await generateTotpCode(fixtureEntry, 60_000));
});

test("createTotpDisplaySnapshot resets progress at period boundaries", async () => {
	const snapshot = await createTotpDisplaySnapshot(fixtureEntry, 60_000);

	assert.equal(snapshot.secondsRemaining, 30);
	assert.equal(snapshot.progressPercent, 0);
	assert.equal(snapshot.isRefreshingSoon, false);
	assert.equal(snapshot.currentCode, await generateTotpCode(fixtureEntry, 60_000));
	assert.equal(snapshot.nextCode, await generateTotpCode(fixtureEntry, 90_000));
});
