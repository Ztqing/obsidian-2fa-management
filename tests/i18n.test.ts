import assert from "node:assert/strict";
import test from "node:test";
import { USER_ERROR_TRANSLATION_KEYS } from "../src/errors";
import { resolveUiLocale } from "../src/i18n/language";
import { translateUiString } from "../src/i18n/translations";

test("resolveUiLocale maps simplified Chinese language codes", () => {
	assert.equal(resolveUiLocale("zh"), "zh-CN");
	assert.equal(resolveUiLocale("zh-CN"), "zh-CN");
	assert.equal(resolveUiLocale("zh-Hans"), "zh-CN");
	assert.equal(resolveUiLocale("zh-SG"), "zh-CN");
});

test("resolveUiLocale maps traditional Chinese language codes", () => {
	assert.equal(resolveUiLocale("zh-TW"), "zh-TW");
	assert.equal(resolveUiLocale("zh-HK"), "zh-TW");
	assert.equal(resolveUiLocale("zh-MO"), "zh-TW");
	assert.equal(resolveUiLocale("zh-Hant"), "zh-TW");
});

test("resolveUiLocale falls back to English for non-Chinese languages", () => {
	assert.equal(resolveUiLocale("en"), "en");
	assert.equal(resolveUiLocale("ja"), "en");
	assert.equal(resolveUiLocale("de"), "en");
	assert.equal(resolveUiLocale(""), "en");
});

test("translateUiString returns locale-specific strings with interpolation", () => {
	assert.equal(
		translateUiString("en", "notice.codeCopied", {
			accountName: "name@example.com",
		}),
		"Copied code for name@example.com.",
	);
	assert.equal(
		translateUiString("zh-CN", "view.entry.countdown", {
			seconds: 15,
		}),
		"剩余 15 秒",
	);
	assert.equal(
		translateUiString("zh-TW", "view.entry.countdown", {
			seconds: 15,
		}),
		"剩餘 15 秒",
	);
});

test("user-facing error codes resolve to localized strings", () => {
	const translationKey = USER_ERROR_TRANSLATION_KEYS.incorrect_master_password;

	assert.equal(
		translateUiString("en", translationKey),
		"The master password is incorrect.",
	);
	assert.equal(
		translateUiString("zh-CN", translationKey),
		"主密码不正确。",
	);
	assert.equal(
		translateUiString("zh-TW", translationKey),
		"主密碼不正確。",
	);
});
