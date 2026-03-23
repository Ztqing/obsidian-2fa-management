import assert from "node:assert/strict";
import test from "node:test";
import { parseOtpauthUri, serializeOtpauthUri } from "../src/totp/otpauth";

test("parseOtpauthUri extracts issuer, account, and token parameters", () => {
	const entry = parseOtpauthUri(
		"otpauth://totp/GitHub:name@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA256&digits=8&period=45",
	);

	assert.deepEqual(entry, {
		issuer: "GitHub",
		accountName: "name@example.com",
		secret: "JBSWY3DPEHPK3PXP",
		algorithm: "SHA-256",
		digits: 8,
		period: 45,
	});
});

test("serializeOtpauthUri round-trips through parseOtpauthUri", () => {
	const originalEntry = {
		issuer: "GitLab",
		accountName: "dev@example.com",
		secret: "JBSWY3DPEHPK3PXP",
		algorithm: "SHA-512" as const,
		digits: 6,
		period: 30,
	};
	const roundTrippedEntry = parseOtpauthUri(serializeOtpauthUri(originalEntry));

	assert.deepEqual(roundTrippedEntry, originalEntry);
});
