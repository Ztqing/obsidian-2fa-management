import type { GuardedActionEnvironment } from "./contracts";
import type {
	LockTimeoutMode,
	PersistedUnlockCapability,
} from "../types";
import type { TranslationKey } from "../i18n/translations";

export function getLockTimeoutModeOptionTranslationKeys(
	capability: PersistedUnlockCapability,
): Record<LockTimeoutMode, TranslationKey> {
	return {
		custom: "settings.lockTimeout.option.custom",
		never:
			capability.availability === "unavailable"
				? "settings.lockTimeout.option.neverUnavailable"
				: "settings.lockTimeout.option.never",
		"on-restart": "settings.lockTimeout.option.onRestart",
	};
}

export function getLockTimeoutDescriptionTranslationKey(
	mode: LockTimeoutMode,
	capability: PersistedUnlockCapability,
): TranslationKey {
	if (mode === "custom") {
		return "settings.lockTimeout.description.custom";
	}

	if (mode === "on-restart") {
		return "settings.lockTimeout.description.onRestart";
	}

	if (capability.source === "compatibility-fallback") {
		return "settings.lockTimeout.description.neverCompatibilityFallback";
	}

	if (capability.availability === "insecure") {
		return "settings.lockTimeout.description.neverInsecure";
	}

	if (capability.availability === "unavailable") {
		return "settings.lockTimeout.description.neverUnavailable";
	}

	return "settings.lockTimeout.description.never";
}

export function getNeverModeWarningTranslationKey(
	capability: PersistedUnlockCapability,
): TranslationKey | null {
	if (capability.availability !== "insecure") {
		return null;
	}

	return capability.source === "compatibility-fallback"
		? "notice.lockTimeoutNeverCompatibilityFallbackWarning"
		: "notice.lockTimeoutNeverInsecureWarning";
}

export interface LockTimeoutModeSelectionEnvironment
	extends GuardedActionEnvironment {
	getPersistedUnlockCapability(): PersistedUnlockCapability;
	setLockTimeoutMode(mode: LockTimeoutMode): Promise<void>;
}

export async function applyLockTimeoutModeSelection(
	environment: LockTimeoutModeSelectionEnvironment,
	currentMode: LockTimeoutMode,
	nextMode: LockTimeoutMode,
): Promise<{
	finalMode: LockTimeoutMode;
	warningTranslationKey: TranslationKey | null;
}> {
	try {
		await environment.setLockTimeoutMode(nextMode);
		return {
			finalMode: nextMode,
			warningTranslationKey:
				nextMode === "never"
					? getNeverModeWarningTranslationKey(
							environment.getPersistedUnlockCapability(),
						)
					: null,
		};
	} catch (error) {
		environment.showNotice?.(environment.getErrorMessage(error));
		return {
			finalMode: currentMode,
			warningTranslationKey: null,
		};
	}
}
