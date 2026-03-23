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

function getWebCrypto(): Crypto {
	if (!globalThis.crypto?.subtle) {
		throw createUserError("crypto_unavailable");
	}

	return globalThis.crypto;
}

function getRandomBytes(length: number): Uint8Array {
	const bytes = new Uint8Array(length);
	getWebCrypto().getRandomValues(bytes);
	return bytes;
}

async function deriveEncryptionKey(
	password: string,
	salt: Uint8Array,
): Promise<CryptoKey> {
	const keyMaterial = await getWebCrypto().subtle.importKey(
		"raw",
		textEncoder.encode(password),
		"PBKDF2",
		false,
		["deriveKey"],
	);

	return getWebCrypto().subtle.deriveKey(
		{
			name: "PBKDF2",
			hash: PBKDF2_HASH,
			salt,
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
	const plaintext = textEncoder.encode(JSON.stringify(entries));
	const cipherText = await getWebCrypto().subtle.encrypt(
		{
			name: "AES-GCM",
			iv,
		},
		key,
		plaintext,
	);

	return {
		version: VAULT_DATA_VERSION,
		saltB64: arrayBufferToBase64(salt.buffer),
		ivB64: arrayBufferToBase64(iv.buffer),
		cipherTextB64: arrayBufferToBase64(cipherText),
	};
}

export async function decryptVaultEntries(
	encryptedVault: EncryptedVaultData,
	password: string,
): Promise<TotpEntryRecord[]> {
	try {
		const salt = base64ToBytes(encryptedVault.saltB64);
		const iv = base64ToBytes(encryptedVault.ivB64);
		const cipherText = base64ToBytes(encryptedVault.cipherTextB64);
		const key = await deriveEncryptionKey(password, salt);
		const plaintext = await getWebCrypto().subtle.decrypt(
			{
				name: "AES-GCM",
				iv,
			},
			key,
			cipherText,
		);
		const parsed = JSON.parse(textDecoder.decode(plaintext)) as unknown;

		return normalizeStoredEntries(parsed);
	} catch (error) {
		if (isTwoFaUserError(error)) {
			throw error;
		}

		if (
			error instanceof Error &&
			(error.name === "OperationError" || error instanceof SyntaxError)
		) {
			throw new InvalidVaultPasswordError();
		}

		throw error;
	}
}
