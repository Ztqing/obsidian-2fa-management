import assert from "node:assert/strict";
import test from "node:test";
import { TwoFaUserError } from "../src/errors";
import { decodeBase32Secret } from "../src/totp/base32";

test("decodeBase32Secret decodes a valid Base32 secret", () => {
	const decoded = decodeBase32Secret("MZXW6YTBOI======");
	const text = new TextDecoder().decode(decoded);

	assert.equal(text, "foobar");
});

test("decodeBase32Secret rejects invalid Base32 characters", () => {
	assert.throws(() => {
		decodeBase32Secret("ABC*123");
	}, (error: unknown) => error instanceof TwoFaUserError && error.code === "secret_invalid_base32");
});
