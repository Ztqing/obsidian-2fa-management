import type { UiLocale } from "../types";

const SIMPLIFIED_CHINESE_CODES = new Set(["zh", "zh-cn", "zh-hans", "zh-sg"]);
const TRADITIONAL_CHINESE_CODES = new Set(["zh-hant", "zh-hk", "zh-mo", "zh-tw"]);

export function resolveUiLocale(languageCode: string | null | undefined): UiLocale {
	const normalizedCode = languageCode?.trim().toLowerCase();

	if (!normalizedCode) {
		return "en";
	}

	if (SIMPLIFIED_CHINESE_CODES.has(normalizedCode)) {
		return "zh-CN";
	}

	if (TRADITIONAL_CHINESE_CODES.has(normalizedCode)) {
		return "zh-TW";
	}

	return "en";
}
