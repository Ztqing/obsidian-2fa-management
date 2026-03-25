import {
	type PreparedTotpEntryCache,
	generateTotpCode,
	getTotpCounter,
	getTotpSecondsRemaining,
} from "./totp";
import type { TotpEntryDraft } from "../types";

export interface TotpDisplaySnapshot {
	counter?: number;
	currentCode: string;
	hasNextCode?: boolean;
	nextCode: string;
	nextCounter?: number;
	period?: number;
	secondsRemaining: number;
	progressPercent: number;
	isRefreshingSoon: boolean;
}

export async function createTotpDisplaySnapshot(
	draft: Pick<TotpEntryDraft, "secret" | "algorithm" | "digits" | "period">,
	timestampMs = Date.now(),
	options: {
		cache?: PreparedTotpEntryCache;
		generateCode?: (
			draft: Pick<TotpEntryDraft, "secret" | "algorithm" | "digits" | "period">,
			timestampMs: number,
			preparedCache?: PreparedTotpEntryCache,
		) => Promise<string>;
		includeNextCode?: boolean;
		previousSnapshot?: TotpDisplaySnapshot | null;
	} = {},
): Promise<TotpDisplaySnapshot> {
	const generateCode = options.generateCode ?? generateTotpCode;
	const includeNextCode = options.includeNextCode ?? true;
	const secondsRemaining = getTotpSecondsRemaining(draft.period, timestampMs);
	const nextTimestampMs = timestampMs + secondsRemaining * 1000;
	const counter = getTotpCounter(draft.period, timestampMs);
	const nextCounter = getTotpCounter(draft.period, nextTimestampMs);
	const previousSnapshot = options.previousSnapshot ?? null;
	const currentCodePromise =
		previousSnapshot?.counter === counter
			? Promise.resolve(previousSnapshot.currentCode)
			: generateCode(draft, timestampMs, options.cache);
	const nextCodePromise =
		includeNextCode
			? previousSnapshot?.hasNextCode === true &&
				previousSnapshot.nextCounter === nextCounter &&
				previousSnapshot.nextCode.length > 0
				? Promise.resolve(previousSnapshot.nextCode)
				: generateCode(draft, nextTimestampMs, options.cache)
			: Promise.resolve("");
	const [currentCode, nextCode] = await Promise.all([currentCodePromise, nextCodePromise]);
	const elapsedSeconds = draft.period - secondsRemaining;
	const progressPercent =
		draft.period <= 0 ? 0 : (elapsedSeconds / draft.period) * 100;

	return {
		counter,
		currentCode,
		hasNextCode: includeNextCode,
		nextCode,
		nextCounter,
		period: draft.period,
		secondsRemaining,
		progressPercent: Math.max(0, Math.min(100, progressPercent)),
		isRefreshingSoon: secondsRemaining <= Math.min(5, draft.period),
	};
}
