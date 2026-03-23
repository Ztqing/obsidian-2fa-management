import { DEFAULT_TOTP_ENTRY } from "../constants";
import { normalizeTotpEntryDraft } from "../data/store";
import { createUserError } from "../errors";
import { sanitizeBase32Secret } from "./base32";
import { normalizeAlgorithm } from "./totp";
import type { TotpEntryDraft } from "../types";

function decodeLabelSegment(segment: string): string {
	return decodeURIComponent(segment.replace(/\+/g, "%20"));
}

function encodeLabelSegment(segment: string): string {
	return encodeURIComponent(segment).replace(/%20/g, "%20");
}

export function parseOtpauthUri(uri: string): TotpEntryDraft {
	const trimmedUri = uri.trim();
	let parsedUrl: URL;

	try {
		parsedUrl = new URL(trimmedUri);
	} catch {
		throw createUserError("invalid_otpauth_uri");
	}

	if (parsedUrl.protocol !== "otpauth:" || parsedUrl.host.toLowerCase() !== "totp") {
		throw createUserError("otpauth_totp_only");
	}

	const rawLabel = decodeLabelSegment(parsedUrl.pathname.replace(/^\/+/u, ""));
	const labelParts = rawLabel.split(":");
	const labelIssuer = labelParts.length > 1 ? labelParts.shift()?.trim() ?? "" : "";
	const accountName = labelParts.length > 0 ? labelParts.join(":").trim() : rawLabel.trim();
	const issuer = parsedUrl.searchParams.get("issuer")?.trim() ?? labelIssuer;
	const secret = sanitizeBase32Secret(parsedUrl.searchParams.get("secret") ?? "");
	const digits = parsedUrl.searchParams.get("digits") ?? DEFAULT_TOTP_ENTRY.digits;
	const period = parsedUrl.searchParams.get("period") ?? DEFAULT_TOTP_ENTRY.period;
	const algorithm = normalizeAlgorithm(
		parsedUrl.searchParams.get("algorithm") ?? DEFAULT_TOTP_ENTRY.algorithm,
	);

	return normalizeTotpEntryDraft({
		issuer,
		accountName,
		secret,
		algorithm,
		digits: Number(digits),
		period: Number(period),
	});
}

export function serializeOtpauthUri(entry: TotpEntryDraft): string {
	const normalizedEntry = normalizeTotpEntryDraft(entry);
	const label = normalizedEntry.issuer
		? `${normalizedEntry.issuer}:${normalizedEntry.accountName}`
		: normalizedEntry.accountName;
	const searchParams = new URLSearchParams();

	searchParams.set("secret", normalizedEntry.secret);
	if (normalizedEntry.issuer) {
		searchParams.set("issuer", normalizedEntry.issuer);
	}
	searchParams.set("algorithm", normalizedEntry.algorithm);
	searchParams.set("digits", String(normalizedEntry.digits));
	searchParams.set("period", String(normalizedEntry.period));

	return `otpauth://totp/${encodeLabelSegment(label)}?${searchParams.toString()}`;
}
