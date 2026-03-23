import assert from "node:assert/strict";
import test from "node:test";
import { generateHotpCode, getTotpSecondsRemaining } from "../src/totp/totp";

const textEncoder = new TextEncoder();

test("generateHotpCode matches RFC 6238 vectors for SHA-1", async () => {
	const counter = Math.floor(59 / 30);
	const code = await generateHotpCode(
		textEncoder.encode("12345678901234567890"),
		counter,
		"SHA-1",
		8,
	);

	assert.equal(code, "94287082");
});

test("generateHotpCode matches RFC 6238 vectors for SHA-256", async () => {
	const counter = Math.floor(59 / 30);
	const code = await generateHotpCode(
		textEncoder.encode("12345678901234567890123456789012"),
		counter,
		"SHA-256",
		8,
	);

	assert.equal(code, "46119246");
});

test("generateHotpCode matches RFC 6238 vectors for SHA-512", async () => {
	const counter = Math.floor(59 / 30);
	const code = await generateHotpCode(
		textEncoder.encode(
			"1234567890123456789012345678901234567890123456789012345678901234",
		),
		counter,
		"SHA-512",
		8,
	);

	assert.equal(code, "90693936");
});

test("getTotpSecondsRemaining returns the remaining time in the current period", () => {
	assert.equal(getTotpSecondsRemaining(30, 59_000), 1);
	assert.equal(getTotpSecondsRemaining(30, 60_000), 30);
});
