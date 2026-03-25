import {
	ENCRYPTION_IV_BYTES,
	ENCRYPTION_KEY_LENGTH,
	ENCRYPTION_SALT_BYTES,
	PBKDF2_HASH,
	PBKDF2_ITERATIONS,
	VAULT_DATA_VERSION,
} from "../constants";
import { normalizeStoredEntries } from "../data/store";
import { InvalidVaultPasswordError, createUserError, isTwoFaUserError } from "../errors";
import type { EncryptedVaultData, TotpEntryRecord } from "../types";
import { arrayBufferToBase64, base64ToBytes } from "../utils/base64";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function cloneBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
	const clone = new Uint8Array(new ArrayBuffer(bytes.byteLength));
	clone.set(bytes);
	return clone;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return cloneBytes(bytes).buffer;
}

function getWebCrypto(): Crypto {
	if (!globalThis.crypto?.subtle) {
		throw createUserError("crypto_unavailable");
	}

	return globalThis.crypto;
}

function getRandomBytes(length: number): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(new ArrayBuffer(length));
	getWebCrypto().getRandomValues(bytes);
	return bytes;
}

function decodeEncryptedVaultBytes(encryptedVault: EncryptedVaultData): {
	cipherText: Uint8Array;
	iv: Uint8Array;
	salt: Uint8Array;
} {
	try {
		const salt = base64ToBytes(encryptedVault.saltB64);
		const iv = base64ToBytes(encryptedVault.ivB64);
		const cipherText = base64ToBytes(encryptedVault.cipherTextB64);

		if (
			salt.length !== ENCRYPTION_SALT_BYTES ||
			iv.length !== ENCRYPTION_IV_BYTES ||
			cipherText.length < 16
		) {
			throw createUserError("vault_data_corrupted");
		}

		return {
			cipherText,
			iv,
			salt,
		};
	} catch (error) {
		if (isTwoFaUserError(error)) {
			throw error;
		}

		throw createUserError("vault_data_corrupted");
	}
}

async function deriveEncryptionKey(
	password: string,
	salt: Uint8Array,
): Promise<CryptoKey> {
	const keyMaterial = await getWebCrypto().subtle.importKey(
		"raw",
		cloneBytes(textEncoder.encode(password)),
		"PBKDF2",
		false,
		["deriveKey"],
	);

	return getWebCrypto().subtle.deriveKey(
		{
			name: "PBKDF2",
			hash: PBKDF2_HASH,
			salt: cloneBytes(salt),
			iterations: PBKDF2_ITERATIONS,
		},
		keyMaterial,
		{
			name: "AES-GCM",
			length: ENCRYPTION_KEY_LENGTH,
		},
		false,
		["encrypt", "decrypt"],
	);
}

export async function encryptVaultEntries(
	entries: readonly TotpEntryRecord[],
	password: string,
): Promise<EncryptedVaultData> {
	const salt = getRandomBytes(ENCRYPTION_SALT_BYTES);
	const iv = getRandomBytes(ENCRYPTION_IV_BYTES);
	const key = await deriveEncryptionKey(password, salt);
	const plaintext = cloneBytes(textEncoder.encode(JSON.stringify(entries)));
	const cipherText = await getWebCrypto().subtle.encrypt(
		{
			name: "AES-GCM",
			iv: cloneBytes(iv),
		},
		key,
		plaintext,
	);

	return {
		version: VAULT_DATA_VERSION,
		saltB64: arrayBufferToBase64(toArrayBuffer(salt)),
		ivB64: arrayBufferToBase64(toArrayBuffer(iv)),
		cipherTextB64: arrayBufferToBase64(cipherText),
	};
}

export async function decryptVaultEntries(
	encryptedVault: EncryptedVaultData,
	password: string,
): Promise<TotpEntryRecord[]> {
	const { salt, iv, cipherText } = decodeEncryptedVaultBytes(encryptedVault);
	let plaintext: ArrayBuffer;

	try {
		const key = await deriveEncryptionKey(password, salt);
		plaintext = await getWebCrypto().subtle.decrypt(
			{
				name: "AES-GCM",
				iv: cloneBytes(iv),
			},
			key,
			cloneBytes(cipherText),
		);
	} catch (error) {
		if (isTwoFaUserError(error)) {
			throw error;
		}

		if (error instanceof Error && error.name === "OperationError") {
			throw new InvalidVaultPasswordError();
		}

		throw error;
	}

	let parsed: unknown;

	try {
		parsed = JSON.parse(textDecoder.decode(plaintext));
	} catch (error) {
		if (error instanceof SyntaxError) {
			throw createUserError("stored_vault_payload_invalid");
		}

		throw error;
	}

	return normalizeStoredEntries(parsed);
}
