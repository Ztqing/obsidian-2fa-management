import assert from "node:assert/strict";
import test from "node:test";
import {
	ENCRYPTION_IV_BYTES,
	ENCRYPTION_KEY_LENGTH,
	ENCRYPTION_SALT_BYTES,
	PBKDF2_HASH,
	PBKDF2_ITERATIONS,
	VAULT_DATA_VERSION,
} from "../src/constants";
import { InvalidVaultPasswordError } from "../src/errors";
import { decryptVaultEntries, encryptVaultEntries } from "../src/security/crypto";
import type { EncryptedVaultData, TotpEntryRecord } from "../src/types";
import { arrayBufferToBase64 } from "../src/utils/base64";

const textEncoder = new TextEncoder();

const sampleEntries: TotpEntryRecord[] = [
	{
		id: "entry-1",
		sortOrder: 0,
		issuer: "GitHub",
		accountName: "name@example.com",
		secret: "JBSWY3DPEHPK3PXP",
		algorithm: "SHA-1",
		digits: 6,
		period: 30,
	},
];

async function encryptRawPayload(
	payload: string,
	password: string,
): Promise<EncryptedVaultData> {
	const salt = crypto.getRandomValues(new Uint8Array(ENCRYPTION_SALT_BYTES));
	const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION_IV_BYTES));
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		textEncoder.encode(password),
		"PBKDF2",
		false,
		["deriveKey"],
	);
	const key = await crypto.subtle.deriveKey(
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
	const cipherText = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv,
		},
		key,
		textEncoder.encode(payload),
	);

	return {
		version: VAULT_DATA_VERSION,
		saltB64: arrayBufferToBase64(salt.buffer),
		ivB64: arrayBufferToBase64(iv.buffer),
		cipherTextB64: arrayBufferToBase64(cipherText),
	};
}

test("encryptVaultEntries round-trips with the correct password", async () => {
	const encrypted = await encryptVaultEntries(sampleEntries, "correct horse battery staple");
	const decrypted = await decryptVaultEntries(encrypted, "correct horse battery staple");

	assert.deepEqual(decrypted, sampleEntries);
});

test("decryptVaultEntries rejects a wrong password", async () => {
	const encrypted = await encryptVaultEntries(sampleEntries, "correct horse battery staple");

	await assert.rejects(
		async () => {
			await decryptVaultEntries(encrypted, "wrong password");
		},
		(error: unknown) => error instanceof InvalidVaultPasswordError,
	);
});

test("decryptVaultEntries rejects corrupted encoded vault data", async () => {
	const encrypted = await encryptVaultEntries(sampleEntries, "correct horse battery staple");

	await assert.rejects(
		async () => {
			await decryptVaultEntries(
				{
					...encrypted,
					cipherTextB64: "%",
				},
				"correct horse battery staple",
			);
		},
		(error: unknown) =>
			error instanceof Error &&
			"code" in error &&
			error.code === "vault_data_corrupted",
	);
});

test("decryptVaultEntries rejects invalid decrypted payloads", async () => {
	const encrypted = await encryptRawPayload(
		JSON.stringify({
			issuer: "GitHub",
		}),
		"correct horse battery staple",
	);

	await assert.rejects(
		async () => {
			await decryptVaultEntries(encrypted, "correct horse battery staple");
		},
		(error: unknown) =>
			error instanceof Error &&
			"code" in error &&
			error.code === "stored_vault_payload_invalid",
	);
});
