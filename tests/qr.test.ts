import assert from "node:assert/strict";
import test from "node:test";
import { TwoFaUserError } from "../src/errors";
import { validateQrPayload } from "../src/totp/qr";

test("validateQrPayload accepts otpauth URIs", () => {
	const uri =
		"otpauth://totp/Example:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example";

	assert.equal(validateQrPayload(uri), uri);
});

test("validateQrPayload rejects non-otpauth QR payloads", () => {
	assert.throws(() => {
		validateQrPayload("https://example.com/login");
	}, (error: unknown) => error instanceof TwoFaUserError && error.code === "otpauth_totp_only");
});
