import { DEFAULT_TOTP_ENTRY, SUPPORTED_TOTP_ALGORITHMS } from "../constants";
import { createUserError } from "../errors";
import { decodeBase32Secret } from "./base32";
import type { TotpAlgorithm, TotpCodeSnapshot, TotpEntryDraft } from "../types";

function getWebCrypto(): Crypto {
	if (!globalThis.crypto?.subtle) {
		throw createUserError("crypto_unavailable");
	}

	return globalThis.crypto;
}

function normalizeHashInput(value: string): string {
	return value.trim().toUpperCase().replace(/_/g, "-");
}

function encodeCounter(counter: number): Uint8Array {
	const counterBytes = new Uint8Array(8);
	let remaining = counter;

	for (let index = counterBytes.length - 1; index >= 0; index -= 1) {
		counterBytes[index] = remaining & 0xff;
		remaining = Math.floor(remaining / 256);
	}

	return counterBytes;
}

export function normalizeAlgorithm(value: unknown): TotpAlgorithm {
	if (typeof value !== "string" || value.trim().length === 0) {
		return DEFAULT_TOTP_ENTRY.algorithm;
	}

	const normalized = normalizeHashInput(value);

	if (normalized === "SHA1") {
		return "SHA-1";
	}

	if (normalized === "SHA256") {
		return "SHA-256";
	}

	if (normalized === "SHA512") {
		return "SHA-512";
	}

	if (SUPPORTED_TOTP_ALGORITHMS.includes(normalized as TotpAlgorithm)) {
		return normalized as TotpAlgorithm;
	}

	throw createUserError("unsupported_algorithm");
}

export async function generateHotpCode(
	secretBytes: Uint8Array,
	counter: number,
	algorithm: TotpAlgorithm,
	digits: number,
): Promise<string> {
	const key = await getWebCrypto().subtle.importKey(
		"raw",
		secretBytes,
		{
			name: "HMAC",
			hash: {
				name: algorithm,
			},
		},
		false,
		["sign"],
	);
	const hmac = new Uint8Array(
		await getWebCrypto().subtle.sign("HMAC", key, encodeCounter(counter)),
	);
	const lastByte = hmac[hmac.length - 1];

	if (lastByte === undefined) {
		throw createUserError("code_generation_failed");
	}

	const offset = lastByte & 0x0f;
	const firstByte = hmac[offset];
	const secondByte = hmac[offset + 1];
	const thirdByte = hmac[offset + 2];
	const fourthByte = hmac[offset + 3];

	if (
		firstByte === undefined ||
		secondByte === undefined ||
		thirdByte === undefined ||
		fourthByte === undefined
	) {
		throw createUserError("code_generation_failed");
	}

	const binary =
		((firstByte & 0x7f) << 24) |
		((secondByte & 0xff) << 16) |
		((thirdByte & 0xff) << 8) |
		(fourthByte & 0xff);
	const otp = binary % 10 ** digits;

	return otp.toString().padStart(digits, "0");
}

export async function generateTotpCode(
	draft: Pick<TotpEntryDraft, "secret" | "algorithm" | "digits" | "period">,
	timestampMs = Date.now(),
): Promise<string> {
	const counter = Math.floor(timestampMs / 1000 / draft.period);
	return generateHotpCode(
		decodeBase32Secret(draft.secret),
		counter,
		draft.algorithm,
		draft.digits,
	);
}

export function getTotpSecondsRemaining(
	period: number,
	timestampMs = Date.now(),
): number {
	const elapsed = Math.floor(timestampMs / 1000) % period;
	const remaining = period - elapsed;

	return remaining === 0 ? period : remaining;
}

export async function createTotpSnapshot(
	draft: Pick<TotpEntryDraft, "secret" | "algorithm" | "digits" | "period">,
	timestampMs = Date.now(),
): Promise<TotpCodeSnapshot> {
	return {
		code: await generateTotpCode(draft, timestampMs),
		secondsRemaining: getTotpSecondsRemaining(draft.period, timestampMs),
	};
}
