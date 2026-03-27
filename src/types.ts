export type PreferredSide = "left" | "right";
export type LockTimeoutMode = "custom" | "on-restart" | "never";
export type PersistedUnlockAvailability =
	| "available"
	| "insecure"
	| "unavailable";
export type PersistedUnlockCapabilitySource =
	| "safe-storage"
	| "compatibility-fallback"
	| "none";

export interface PersistedUnlockCapability {
	availability: PersistedUnlockAvailability;
	source: PersistedUnlockCapabilitySource;
}

export type TotpAlgorithm = "SHA-1" | "SHA-256" | "SHA-512";
export type UiLocale = "en" | "zh-CN" | "zh-TW";
export type TranslationVariables = Record<string, number | string>;
export type VaultLoadIssue = "corrupted" | "unsupported_version";

export interface EncryptedVaultData {
	version: 1;
	saltB64: string;
	ivB64: string;
	cipherTextB64: string;
}

export interface LegacyPersistedUnlockData {
	version: 1;
	protectedPasswordB64: string;
}

export interface SafeStoragePersistedUnlockData {
	kind: "safe-storage";
	version: 2;
	protectedPasswordB64: string;
}

export interface CompatibilityFallbackPersistedUnlockData {
	kind: "compatibility-fallback";
	version: 2;
	plainPassword: string;
}

export type PersistedUnlockData =
	| LegacyPersistedUnlockData
	| SafeStoragePersistedUnlockData
	| CompatibilityFallbackPersistedUnlockData;

export interface PluginSettings {
	allowInsecurePersistedUnlockFallback: boolean;
	lockTimeoutMinutes: number;
	lockTimeoutMode: LockTimeoutMode;
	preferredSide: PreferredSide;
	showUpcomingCodes: boolean;
}

export interface PluginData {
	schemaVersion: 1;
	persistedUnlock: PersistedUnlockData | null;
	vaultRevision: number;
	vault: EncryptedVaultData | null;
	settings: PluginSettings;
}

export interface TotpEntryRecord {
	id: string;
	sortOrder: number;
	issuer: string;
	accountName: string;
	secret: string;
	algorithm: TotpAlgorithm;
	digits: number;
	period: number;
}

export type TotpEntryDraft = Omit<TotpEntryRecord, "id" | "sortOrder">;

export interface TotpCodeSnapshot {
	code: string;
	secondsRemaining: number;
}

export interface BulkOtpauthImportEntryBase {
	lineNumber: number;
	rawLine: string;
	duplicateKey: string;
	entry: TotpEntryDraft;
}

export interface BulkOtpauthImportNewEntry extends BulkOtpauthImportEntryBase {
	kind: "new";
}

export interface BulkOtpauthImportDuplicateExistingEntry
	extends BulkOtpauthImportEntryBase {
	kind: "duplicate-existing";
	existingEntry: TotpEntryRecord;
}

export interface BulkOtpauthImportDuplicateBatchEntry
	extends BulkOtpauthImportEntryBase {
	kind: "duplicate-batch";
	firstLineNumber: number;
}

export interface BulkOtpauthImportInvalidEntry {
	kind: "invalid";
	lineNumber: number;
	rawLine: string;
	errorMessage: string;
}

export interface BulkOtpauthImportPreviewStats {
	newCount: number;
	duplicateExistingCount: number;
	duplicateBatchCount: number;
	invalidCount: number;
	actionableCount: number;
}

export interface BulkOtpauthImportPreview {
	sourceText: string;
	newEntries: BulkOtpauthImportNewEntry[];
	duplicateExistingEntries: BulkOtpauthImportDuplicateExistingEntry[];
	duplicateBatchEntries: BulkOtpauthImportDuplicateBatchEntry[];
	invalidEntries: BulkOtpauthImportInvalidEntry[];
	stats: BulkOtpauthImportPreviewStats;
}

export interface BulkOtpauthImportSubmission {
	expectedVaultRevision: number;
	preview: BulkOtpauthImportPreview;
	selectedDuplicateLineNumbers: number[];
}

export interface BulkOtpauthImportCommitResult {
	nextEntries: TotpEntryRecord[];
	addedEntries: TotpEntryRecord[];
	replacedEntries: TotpEntryRecord[];
	skippedDuplicateExistingEntries: BulkOtpauthImportDuplicateExistingEntry[];
	skippedDuplicateBatchEntries: BulkOtpauthImportDuplicateBatchEntry[];
	invalidEntries: BulkOtpauthImportInvalidEntry[];
}
