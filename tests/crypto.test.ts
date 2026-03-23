import assert from "node:assert/strict";
import test from "node:test";
import { InvalidVaultPasswordError } from "../src/errors";
import { decryptVaultEntries, encryptVaultEntries } from "../src/security/crypto";
import type { TotpEntryRecord } from "../src/types";

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
