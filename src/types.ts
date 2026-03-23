export type PreferredSide = "left" | "right";

export type TotpAlgorithm = "SHA-1" | "SHA-256" | "SHA-512";
export type UiLocale = "en" | "zh-CN" | "zh-TW";
export type TranslationVariables = Record<string, number | string>;

export interface EncryptedVaultData {
	version: 1;
	saltB64: string;
	ivB64: string;
	cipherTextB64: string;
}

export interface PluginSettings {
	preferredSide: PreferredSide;
}

export interface PluginData {
	schemaVersion: 1;
	vault: EncryptedVaultData | null;
	settings: PluginSettings;
}

export interface TotpEntryRecord {
	id: string;
	issuer: string;
	accountName: string;
	secret: string;
	algorithm: TotpAlgorithm;
	digits: number;
	period: number;
}

export type TotpEntryDraft = Omit<TotpEntryRecord, "id">;

export interface TotpCodeSnapshot {
	code: string;
	secondsRemaining: number;
}
