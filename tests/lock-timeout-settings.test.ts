import assert from "node:assert/strict";
import test from "node:test";
import {
	applyLockTimeoutModeSelection,
	getLockTimeoutDescriptionTranslationKey,
	getLockTimeoutModeOptionTranslationKeys,
	getNeverModeWarningTranslationKey,
} from "../src/application/lock-timeout-settings";
import type { LockTimeoutMode, PersistedUnlockCapability } from "../src/types";

test("getLockTimeoutModeOptionTranslationKeys keeps never visible for every availability state", () => {
	assert.deepEqual(
		getLockTimeoutModeOptionTranslationKeys({
			availability: "available",
			source: "safe-storage",
		}),
		{
			custom: "settings.lockTimeout.option.custom",
			never: "settings.lockTimeout.option.never",
			"on-restart": "settings.lockTimeout.option.onRestart",
		},
	);

	assert.deepEqual(
		getLockTimeoutModeOptionTranslationKeys({
			availability: "insecure",
			source: "safe-storage",
		}),
		{
			custom: "settings.lockTimeout.option.custom",
			never: "settings.lockTimeout.option.never",
			"on-restart": "settings.lockTimeout.option.onRestart",
		},
	);

	assert.deepEqual(
		getLockTimeoutModeOptionTranslationKeys({
			availability: "unavailable",
			source: "none",
		}),
		{
			custom: "settings.lockTimeout.option.custom",
			never: "settings.lockTimeout.option.neverUnavailable",
			"on-restart": "settings.lockTimeout.option.onRestart",
		},
	);
});

test("lock timeout helper chooses compatibility-specific copy for insecure fallback mode", () => {
	const compatibilityCapability: PersistedUnlockCapability = {
		availability: "insecure",
		source: "compatibility-fallback",
	};

	assert.equal(
		getLockTimeoutDescriptionTranslationKey("never", compatibilityCapability),
		"settings.lockTimeout.description.neverCompatibilityFallback",
	);
	assert.equal(
		getNeverModeWarningTranslationKey(compatibilityCapability),
		"notice.lockTimeoutNeverCompatibilityFallbackWarning",
	);
	assert.equal(
		getNeverModeWarningTranslationKey({
			availability: "insecure",
			source: "safe-storage",
		}),
		"notice.lockTimeoutNeverInsecureWarning",
	);
	assert.equal(
		getNeverModeWarningTranslationKey({
			availability: "available",
			source: "safe-storage",
		}),
		null,
	);
});

test("applyLockTimeoutModeSelection returns the appropriate warning key when never is enabled", async () => {
	const persistedModes: LockTimeoutMode[] = [];
	const notices: string[] = [];
	const environment = {
		getErrorMessage: () => "should not be used",
		getPersistedUnlockCapability: () =>
			({
				availability: "insecure",
				source: "safe-storage",
			}) as const,
		setLockTimeoutMode: async (mode: LockTimeoutMode) => {
			persistedModes.push(mode);
		},
		showNotice: (message: string) => {
			notices.push(message);
		},
	};

	const result = await applyLockTimeoutModeSelection(
		environment,
		"on-restart",
		"never",
	);

	assert.deepEqual(persistedModes, ["never"]);
	assert.deepEqual(notices, []);
	assert.deepEqual(result, {
		finalMode: "never",
		warningTranslationKey: "notice.lockTimeoutNeverInsecureWarning",
	});
});

test("applyLockTimeoutModeSelection falls back to the current mode when never is unavailable", async () => {
	const persistedModes: LockTimeoutMode[] = [];
	const notices: string[] = [];
	const environment = {
		getErrorMessage: (error: unknown) =>
			error instanceof Error ? error.message : "unknown_error",
		getPersistedUnlockCapability: () =>
			({
				availability: "unavailable",
				source: "none",
			}) as const,
		setLockTimeoutMode: async (mode: LockTimeoutMode) => {
			persistedModes.push(mode);
			throw new Error("persisted_unlock_unavailable");
		},
		showNotice: (message: string) => {
			notices.push(message);
		},
	};

	const result = await applyLockTimeoutModeSelection(
		environment,
		"custom",
		"never",
	);

	assert.deepEqual(persistedModes, ["never"]);
	assert.deepEqual(notices, ["persisted_unlock_unavailable"]);
	assert.deepEqual(result, {
		finalMode: "custom",
		warningTranslationKey: null,
	});
});
