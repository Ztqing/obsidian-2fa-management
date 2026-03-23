import { getIcon } from "obsidian";
import type { TotpEntryRecord } from "../types";

export type ProviderIconAvailability = (iconId: string) => boolean;

type ProviderIdentity = Pick<TotpEntryRecord, "accountName" | "issuer">;

const GENERIC_FALLBACK_ICONS = ["shield-check", "key-round", "globe"] as const;

const PROVIDER_ICON_CANDIDATES = new Map<string, readonly string[]>([
	["github", ["github"]],
	["gitlab", ["gitlab"]],
	["google", ["chrome", "globe"]],
	["gmail", ["mail", "chrome", "globe"]],
	["google workspace", ["building-2", "chrome", "globe"]],
	["microsoft", ["app-window", "building-2"]],
	["outlook", ["mail", "app-window"]],
	["office 365", ["building-2", "app-window"]],
	["office365", ["building-2", "app-window"]],
	["azure", ["cloud", "app-window"]],
	["entra", ["building-2", "app-window"]],
	["amazon", ["cloud"]],
	["aws", ["cloud"]],
	["apple", ["smartphone"]],
	["icloud", ["cloud", "smartphone"]],
	["slack", ["message-square"]],
	["discord", ["messages-square", "message-square"]],
	["notion", ["notebook-tabs", "notebook"]],
	["dropbox", ["box"]],
	["bitwarden", ["shield-check"]],
	["1password", ["shield-check"]],
	["authy", ["shield-check"]],
	["paypal", ["credit-card"]],
	["stripe", ["credit-card"]],
]);

const DOMAIN_PROVIDER_ALIASES = new Map<string, string>([
	["github.com", "github"],
	["gitlab.com", "gitlab"],
	["google.com", "google"],
	["gmail.com", "gmail"],
	["googlemail.com", "gmail"],
	["outlook.com", "outlook"],
	["hotmail.com", "outlook"],
	["live.com", "outlook"],
	["office.com", "office 365"],
	["microsoft.com", "microsoft"],
	["azure.com", "azure"],
	["entra.microsoft.com", "entra"],
	["icloud.com", "icloud"],
	["apple.com", "apple"],
	["amazon.com", "amazon"],
	["aws.amazon.com", "aws"],
	["slack.com", "slack"],
	["discord.com", "discord"],
	["notion.so", "notion"],
	["notion.com", "notion"],
	["dropbox.com", "dropbox"],
	["bitwarden.com", "bitwarden"],
	["1password.com", "1password"],
	["authy.com", "authy"],
	["paypal.com", "paypal"],
	["stripe.com", "stripe"],
]);

export function normalizeProviderKey(value: string): string {
	return value
		.toLocaleLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

export function isBuiltInIconAvailable(iconId: string): boolean {
	return getIcon(iconId) !== null;
}

export function resolveProviderIcon(
	entry: ProviderIdentity,
	isIconAvailable: ProviderIconAvailability = isBuiltInIconAvailable,
): string {
	const providerKey = getProviderKey(entry);
	const providerCandidates = providerKey
		? PROVIDER_ICON_CANDIDATES.get(providerKey)
		: undefined;

	if (providerCandidates) {
		const matchedIcon = getFirstAvailableIcon(providerCandidates, isIconAvailable);
		if (matchedIcon) {
			return matchedIcon;
		}
	}

	return getFirstAvailableIcon(GENERIC_FALLBACK_ICONS, isIconAvailable) ?? "shield-check";
}

function getProviderKey(entry: ProviderIdentity): string | null {
	const issuerKey = normalizeProviderKey(entry.issuer);
	if (issuerKey) {
		const directMatch = findProviderAliasKey(issuerKey);
		if (directMatch) {
			return directMatch;
		}
	}

	const accountDomain = getAccountDomain(entry.accountName);
	if (!accountDomain) {
		return null;
	}

	return DOMAIN_PROVIDER_ALIASES.get(accountDomain) ?? null;
}

function findProviderAliasKey(issuerKey: string): string | null {
	let bestMatch: string | null = null;

	for (const candidateKey of PROVIDER_ICON_CANDIDATES.keys()) {
		if (
			issuerKey === candidateKey ||
			issuerKey.includes(candidateKey)
		) {
			if (!bestMatch || candidateKey.length > bestMatch.length) {
				bestMatch = candidateKey;
			}
		}
	}

	return bestMatch;
}

function getAccountDomain(accountName: string): string | null {
	const normalized = accountName.trim().toLocaleLowerCase();
	const atIndex = normalized.lastIndexOf("@");

	if (atIndex >= 0 && atIndex < normalized.length - 1) {
		return normalized.slice(atIndex + 1);
	}

	try {
		const url = new URL(normalized.startsWith("http") ? normalized : `https://${normalized}`);
		return url.hostname;
	} catch {
		return null;
	}
}

function getFirstAvailableIcon(
	candidates: readonly string[],
	isIconAvailable: ProviderIconAvailability,
): string | null {
	for (const candidate of candidates) {
		if (isIconAvailable(candidate)) {
			return candidate;
		}
	}

	return null;
}
