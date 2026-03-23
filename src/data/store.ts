import {
	DEFAULT_PLUGIN_DATA,
	DEFAULT_TOTP_ENTRY,
	MAX_TOTP_DIGITS,
	MAX_TOTP_PERIOD,
	MIN_TOTP_DIGITS,
	MIN_TOTP_PERIOD,
	VAULT_DATA_VERSION,
} from "../constants";
import { createUserError } from "../errors";
import { sanitizeBase32Secret } from "../totp/base32";
import { normalizeAlgorithm } from "../totp/totp";
import type {
	EncryptedVaultData,
	PluginData,
	PreferredSide,
	TotpEntryDraft,
	TotpEntryRecord,
} from "../types";

const collator = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function normalizePreferredSide(value: unknown): PreferredSide {
	return value === "left" ? "left" : "right";
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function normalizePositiveInteger(
	value: unknown,
	minimum: number,
	maximum: number,
	errorCode: "digits_out_of_range" | "period_out_of_range",
): number {
	const parsed = typeof value === "number" ? value : Number(value);

	if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw createUserError(errorCode, {
			minimum,
			maximum,
		});
	}

	return parsed;
}

export function isEncryptedVaultData(value: unknown): value is EncryptedVaultData {
	if (!isRecord(value)) {
		return false;
	}

	return (
		value.version === VAULT_DATA_VERSION &&
		typeof value.saltB64 === "string" &&
		typeof value.ivB64 === "string" &&
		typeof value.cipherTextB64 === "string"
	);
}

export function normalizePluginData(value: unknown): PluginData {
	if (!isRecord(value)) {
		return {
			schemaVersion: DEFAULT_PLUGIN_DATA.schemaVersion,
			vault: DEFAULT_PLUGIN_DATA.vault,
			settings: {
				preferredSide: DEFAULT_PLUGIN_DATA.settings.preferredSide,
				showUpcomingCodes: DEFAULT_PLUGIN_DATA.settings.showUpcomingCodes,
				showFloatingLockButton:
					DEFAULT_PLUGIN_DATA.settings.showFloatingLockButton,
			},
		};
	}

	const rawSettings = isRecord(value.settings) ? value.settings : {};
	const vault = isEncryptedVaultData(value.vault) ? value.vault : null;

	return {
		schemaVersion: DEFAULT_PLUGIN_DATA.schemaVersion,
		vault,
		settings: {
			preferredSide: normalizePreferredSide(rawSettings.preferredSide),
			showUpcomingCodes: normalizeBoolean(
				rawSettings.showUpcomingCodes,
				DEFAULT_PLUGIN_DATA.settings.showUpcomingCodes,
			),
			showFloatingLockButton: normalizeBoolean(
				rawSettings.showFloatingLockButton,
				DEFAULT_PLUGIN_DATA.settings.showFloatingLockButton,
			),
		},
	};
}

export function normalizeTotpEntryDraft(value: TotpEntryDraft): TotpEntryDraft {
	const issuer = value.issuer.trim();
	const accountName = value.accountName.trim();
	const secret = sanitizeBase32Secret(value.secret);
	const digits = normalizePositiveInteger(
		value.digits,
		MIN_TOTP_DIGITS,
		MAX_TOTP_DIGITS,
		"digits_out_of_range",
	);
	const period = normalizePositiveInteger(
		value.period,
		MIN_TOTP_PERIOD,
		MAX_TOTP_PERIOD,
		"period_out_of_range",
	);
	const algorithm = normalizeAlgorithm(value.algorithm);

	if (accountName.length === 0) {
		throw createUserError("account_name_required");
	}

	if (secret.length === 0) {
		throw createUserError("secret_required");
	}

	return {
		issuer,
		accountName,
		secret,
		algorithm,
		digits,
		period,
	};
}

function compareEntriesAlphabetically(
	left: Pick<TotpEntryRecord, "accountName" | "id" | "issuer">,
	right: Pick<TotpEntryRecord, "accountName" | "id" | "issuer">,
): number {
	const issuerComparison = collator.compare(left.issuer, right.issuer);

	if (issuerComparison !== 0) {
		return issuerComparison;
	}

	const accountComparison = collator.compare(left.accountName, right.accountName);

	if (accountComparison !== 0) {
		return accountComparison;
	}

	return collator.compare(left.id, right.id);
}

export function normalizeStoredEntryRecord(
	value: unknown,
	fallbackSortOrder = 0,
): TotpEntryRecord {
	if (!isRecord(value) || typeof value.id !== "string") {
		throw createUserError("stored_entry_invalid");
	}

	return {
		id: value.id,
		sortOrder: normalizeNonNegativeInteger(value.sortOrder, fallbackSortOrder),
		...normalizeTotpEntryDraft({
			issuer: normalizeString(value.issuer),
			accountName: normalizeString(value.accountName),
			secret: normalizeString(value.secret),
			algorithm: normalizeAlgorithm(value.algorithm),
			digits: Number(
				typeof value.digits === "number" || typeof value.digits === "string"
					? value.digits
					: DEFAULT_TOTP_ENTRY.digits,
			),
			period: Number(
				typeof value.period === "number" || typeof value.period === "string"
					? value.period
					: DEFAULT_TOTP_ENTRY.period,
			),
		}),
	};
}

export function reindexTotpEntries(entries: readonly TotpEntryRecord[]): TotpEntryRecord[] {
	return entries.map((entry, index) => ({
		...entry,
		sortOrder: index,
	}));
}

export function normalizeStoredEntries(value: unknown): TotpEntryRecord[] {
	if (!Array.isArray(value)) {
		throw createUserError("stored_vault_payload_invalid");
	}

	return reindexTotpEntries(
		sortTotpEntries(value.map((entry, index) => normalizeStoredEntryRecord(entry, index))),
	);
}

export function sortTotpEntries(entries: readonly TotpEntryRecord[]): TotpEntryRecord[] {
	return [...entries].sort((left, right) => {
		const sortOrderComparison = left.sortOrder - right.sortOrder;

		if (sortOrderComparison !== 0) {
			return sortOrderComparison;
		}

		return compareEntriesAlphabetically(left, right);
	});
}

export function getNextTotpSortOrder(entries: readonly TotpEntryRecord[]): number {
	return (
		entries.reduce((highestSortOrder, entry) => {
			return Math.max(highestSortOrder, entry.sortOrder);
		}, -1) + 1
	);
}

export function filterTotpEntries(
	entries: readonly TotpEntryRecord[],
	query: string,
): TotpEntryRecord[] {
	const orderedEntries = sortTotpEntries(entries);
	const normalizedQuery = query.trim().toLocaleLowerCase();

	if (normalizedQuery.length === 0) {
		return orderedEntries;
	}

	return orderedEntries.filter((entry) => {
			const haystack = `${entry.issuer} ${entry.accountName}`.toLocaleLowerCase();
			return haystack.includes(normalizedQuery);
		});
}
