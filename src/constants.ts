import type { PluginData, TotpAlgorithm, TotpEntryDraft } from "./types";

export const OBSIDIAN_2FA_VIEW = "OBSIDIAN_2FA_VIEW";

export const VAULT_DATA_VERSION = 1;
export const PLUGIN_DATA_SCHEMA_VERSION = 1;

export const PBKDF2_ITERATIONS = 250_000;
export const PBKDF2_HASH = "SHA-256";
export const ENCRYPTION_KEY_LENGTH = 256;
export const ENCRYPTION_SALT_BYTES = 16;
export const ENCRYPTION_IV_BYTES = 12;

export const DEFAULT_TOTP_ENTRY: TotpEntryDraft = {
	issuer: "",
	accountName: "",
	secret: "",
	algorithm: "SHA-1",
	digits: 6,
	period: 30,
};

export const SUPPORTED_TOTP_ALGORITHMS: readonly TotpAlgorithm[] = [
	"SHA-1",
	"SHA-256",
	"SHA-512",
];

export const DEFAULT_PLUGIN_DATA: PluginData = {
	schemaVersion: PLUGIN_DATA_SCHEMA_VERSION,
	vault: null,
	settings: {
		preferredSide: "right",
	},
};

export const MAX_TOTP_DIGITS = 10;
export const MIN_TOTP_DIGITS = 6;
export const MAX_TOTP_PERIOD = 300;
export const MIN_TOTP_PERIOD = 1;
