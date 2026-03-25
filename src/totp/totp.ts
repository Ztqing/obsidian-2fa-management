import { DEFAULT_TOTP_ENTRY, SUPPORTED_TOTP_ALGORITHMS } from "../constants";
import { createUserError } from "../errors";
import { decodeBase32Secret, sanitizeBase32Secret } from "./base32";
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

function cloneBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
	const clone = new Uint8Array(new ArrayBuffer(bytes.byteLength));
	clone.set(bytes);
	return clone;
}

function createPreparedEntryFingerprint(
	draft: Pick<TotpEntryDraft, "secret" | "algorithm" | "digits" | "period">,
): string {
	return [
		sanitizeBase32Secret(draft.secret),
		draft.algorithm,
		String(draft.digits),
		String(draft.period),
	].join(":");
}

function encodeCounter(counter: number): Uint8Array<ArrayBuffer> {
	const counterBytes = new Uint8Array(new ArrayBuffer(8));
	let remaining = counter;

	for (let index = counterBytes.length - 1; index >= 0; index -= 1) {
		counterBytes[index] = remaining & 0xff;
		remaining = Math.floor(remaining / 256);
	}

	return counterBytes;
}

async function importHotpKey(
	secretBytes: Uint8Array,
	algorithm: TotpAlgorithm,
): Promise<CryptoKey> {
	return getWebCrypto().subtle.importKey(
		"raw",
		cloneBytes(secretBytes),
		{
			name: "HMAC",
			hash: {
				name: algorithm,
			},
		},
		false,
		["sign"],
	);
}

function deriveHotpCodeFromHmac(hmac: Uint8Array, digits: number): string {
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

async function generateHotpCodeFromKey(
	key: CryptoKey,
	counter: number,
	digits: number,
): Promise<string> {
	const hmac = new Uint8Array(
		await getWebCrypto().subtle.sign("HMAC", key, encodeCounter(counter)),
	);

	return deriveHotpCodeFromHmac(hmac, digits);
}

export interface PreparedTotpEntry {
	fingerprint: string;
	getCode(counter: number): Promise<string>;
}

export interface PreparedTotpEntryCache {
	clear(): void;
	deleteFingerprint(fingerprint: string): void;
	getFingerprint(
		draft: Pick<TotpEntryDraft, "secret" | "algorithm" | "digits" | "period">,
	): string;
	getPreparedEntry(
		draft: Pick<TotpEntryDraft, "secret" | "algorithm" | "digits" | "period">,
	): PreparedTotpEntry;
}

class CachedPreparedTotpEntry implements PreparedTotpEntry {
	private readonly codeByCounter = new Map<number, string>();
	private readonly keyPromise: Promise<CryptoKey>;

	constructor(
		readonly fingerprint: string,
		private readonly digits: number,
		secretBytes: Uint8Array,
		algorithm: TotpAlgorithm,
	) {
		this.keyPromise = importHotpKey(secretBytes, algorithm);
	}

	async getCode(counter: number): Promise<string> {
		const cachedCode = this.codeByCounter.get(counter);
		if (cachedCode) {
			return cachedCode;
		}

		const code = await generateHotpCodeFromKey(
			await this.keyPromise,
			counter,
			this.digits,
		);
		this.codeByCounter.set(counter, code);

		if (this.codeByCounter.size > 4) {
			const oldestCounter = this.codeByCounter.keys().next().value;
			if (typeof oldestCounter === "number") {
				this.codeByCounter.delete(oldestCounter);
			}
		}

		return code;
	}
}

class DefaultPreparedTotpEntryCache implements PreparedTotpEntryCache {
	private readonly entries = new Map<string, PreparedTotpEntry>();

	clear(): void {
		this.entries.clear();
	}

	deleteFingerprint(fingerprint: string): void {
		this.entries.delete(fingerprint);
	}

	getFingerprint(
		draft: Pick<TotpEntryDraft, "secret" | "algorithm" | "digits" | "period">,
	): string {
		return createPreparedEntryFingerprint(draft);
	}

	getPreparedEntry(
		draft: Pick<TotpEntryDraft, "secret" | "algorithm" | "digits" | "period">,
	): PreparedTotpEntry {
		const fingerprint = this.getFingerprint(draft);
		const cachedEntry = this.entries.get(fingerprint);

		if (cachedEntry) {
			return cachedEntry;
		}

		const preparedEntry = new CachedPreparedTotpEntry(
			fingerprint,
			draft.digits,
			cloneBytes(decodeBase32Secret(draft.secret)),
			draft.algorithm,
		);
		this.entries.set(fingerprint, preparedEntry);
		return preparedEntry;
	}
}

const sharedPreparedTotpEntryCache = new DefaultPreparedTotpEntryCache();

export function createPreparedTotpEntryCache(): PreparedTotpEntryCache {
	return new DefaultPreparedTotpEntryCache();
}

export function clearSharedPreparedTotpEntryCache(): void {
	sharedPreparedTotpEntryCache.clear();
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
	return generateHotpCodeFromKey(
		await importHotpKey(secretBytes, algorithm),
		counter,
		digits,
	);
}

export function getTotpCounter(period: number, timestampMs = Date.now()): number {
	return Math.floor(timestampMs / 1000 / period);
}

export async function generateTotpCode(
	draft: Pick<TotpEntryDraft, "secret" | "algorithm" | "digits" | "period">,
	timestampMs = Date.now(),
	preparedCache?: PreparedTotpEntryCache,
): Promise<string> {
	const counter = getTotpCounter(draft.period, timestampMs);
	const cache = preparedCache ?? sharedPreparedTotpEntryCache;

	return cache.getPreparedEntry(draft).getCode(counter);
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
	preparedCache?: PreparedTotpEntryCache,
): Promise<TotpCodeSnapshot> {
	return {
		code: await generateTotpCode(draft, timestampMs, preparedCache),
		secondsRemaining: getTotpSecondsRemaining(draft.period, timestampMs),
	};
}
