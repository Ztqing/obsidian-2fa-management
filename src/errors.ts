import type { TranslationKey } from "./i18n/translations";
import type { TranslationVariables } from "./types";

export type TwoFaUserErrorCode =
	| "account_name_required"
	| "bulk_import_preview_stale"
	| "clipboard_unavailable"
	| "code_generation_failed"
	| "crypto_unavailable"
	| "digits_out_of_range"
	| "entry_changed_during_edit"
	| "entry_not_found"
	| "image_pixels_unavailable"
	| "image_read_failed"
	| "incorrect_master_password"
	| "invalid_otpauth_uri"
	| "otpauth_totp_only"
	| "period_out_of_range"
	| "qr_not_found"
	| "secret_base32_too_short"
	| "secret_invalid_base32"
	| "secret_required"
	| "stored_entry_invalid"
	| "stored_vault_payload_invalid"
	| "unexpected_error"
	| "unsupported_algorithm"
	| "vault_repair_required"
	| "vault_data_corrupted"
	| "vault_unlock_required";

export class TwoFaUserError extends Error {
	readonly code: TwoFaUserErrorCode;
	readonly params: TranslationVariables;

	constructor(code: TwoFaUserErrorCode, params: TranslationVariables = {}) {
		super(code);
		this.name = "TwoFaUserError";
		this.code = code;
		this.params = params;
	}
}

export class InvalidVaultPasswordError extends TwoFaUserError {
	constructor() {
		super("incorrect_master_password");
		this.name = "InvalidVaultPasswordError";
	}
}

export const USER_ERROR_TRANSLATION_KEYS: Record<TwoFaUserErrorCode, TranslationKey> = {
	account_name_required: "error.accountNameRequired",
	bulk_import_preview_stale: "error.bulkImportPreviewStale",
	clipboard_unavailable: "error.clipboardUnavailable",
	code_generation_failed: "error.codeGenerationFailed",
	crypto_unavailable: "error.cryptoUnavailable",
	digits_out_of_range: "error.digitsOutOfRange",
	entry_changed_during_edit: "error.entryChangedDuringEdit",
	entry_not_found: "error.entryNotFound",
	image_pixels_unavailable: "error.imagePixelsUnavailable",
	image_read_failed: "error.imageReadFailed",
	incorrect_master_password: "error.incorrectMasterPassword",
	invalid_otpauth_uri: "error.invalidOtpauthUri",
	otpauth_totp_only: "error.otpauthTotpOnly",
	period_out_of_range: "error.periodOutOfRange",
	qr_not_found: "error.qrNotFound",
	secret_base32_too_short: "error.secretBase32TooShort",
	secret_invalid_base32: "error.secretInvalidBase32",
	secret_required: "error.secretRequired",
	stored_entry_invalid: "error.storedEntryInvalid",
	stored_vault_payload_invalid: "error.storedVaultPayloadInvalid",
	unexpected_error: "error.unexpected",
	unsupported_algorithm: "error.unsupportedAlgorithm",
	vault_repair_required: "error.vaultRepairRequired",
	vault_data_corrupted: "error.vaultDataCorrupted",
	vault_unlock_required: "error.vaultUnlockRequired",
};

export function createUserError(
	code: TwoFaUserErrorCode,
	params: TranslationVariables = {},
): TwoFaUserError {
	return new TwoFaUserError(code, params);
}

export function isTwoFaUserError(error: unknown): error is TwoFaUserError {
	return error instanceof TwoFaUserError;
}
