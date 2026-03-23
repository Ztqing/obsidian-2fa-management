import { generateTotpCode, getTotpSecondsRemaining } from "./totp";
import type { TotpEntryDraft } from "../types";

export interface TotpDisplaySnapshot {
	currentCode: string;
	nextCode: string;
	secondsRemaining: number;
	progressPercent: number;
	isRefreshingSoon: boolean;
}

export async function createTotpDisplaySnapshot(
	draft: Pick<TotpEntryDraft, "secret" | "algorithm" | "digits" | "period">,
	timestampMs = Date.now(),
): Promise<TotpDisplaySnapshot> {
	const secondsRemaining = getTotpSecondsRemaining(draft.period, timestampMs);
	const nextTimestampMs = timestampMs + secondsRemaining * 1000;
	const [currentCode, nextCode] = await Promise.all([
		generateTotpCode(draft, timestampMs),
		generateTotpCode(draft, nextTimestampMs),
	]);
	const elapsedSeconds = draft.period - secondsRemaining;
	const progressPercent =
		draft.period <= 0 ? 0 : (elapsedSeconds / draft.period) * 100;

	return {
		currentCode,
		nextCode,
		secondsRemaining,
		progressPercent: Math.max(0, Math.min(100, progressPercent)),
		isRefreshingSoon: secondsRemaining <= Math.min(5, draft.period),
	};
}
