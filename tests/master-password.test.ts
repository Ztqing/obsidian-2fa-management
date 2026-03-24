import assert from "node:assert/strict";
import test from "node:test";
import {
	MIN_MASTER_PASSWORD_LENGTH,
	validateMasterPasswordInput,
} from "../src/security/master-password";

test("validateMasterPasswordInput rejects empty passwords", () => {
	assert.equal(validateMasterPasswordInput(""), "empty");
});

test("validateMasterPasswordInput enforces minimum length only when provided", () => {
	assert.equal(
		validateMasterPasswordInput("short-pass", {
			minimumLength: MIN_MASTER_PASSWORD_LENGTH,
		}),
		"too_short",
	);
	assert.equal(
		validateMasterPasswordInput("short-pass"),
		null,
	);
});

test("validateMasterPasswordInput validates confirmation after length checks", () => {
	assert.equal(
		validateMasterPasswordInput("long-enough-password", {
			confirmation: "mismatch",
			minimumLength: MIN_MASTER_PASSWORD_LENGTH,
			requireConfirmation: true,
		}),
		"mismatch",
	);
	assert.equal(
		validateMasterPasswordInput("long-enough-password", {
			confirmation: "long-enough-password",
			minimumLength: MIN_MASTER_PASSWORD_LENGTH,
			requireConfirmation: true,
		}),
		null,
	);
});
