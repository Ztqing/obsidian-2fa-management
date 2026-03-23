import assert from "node:assert/strict";
import test from "node:test";
import {
	normalizeProviderKey,
	resolveProviderIcon,
} from "../src/ui/provider-icons";

function createIconAvailability(...availableIcons: string[]) {
	const iconSet = new Set(availableIcons);
	return (iconId: string): boolean => iconSet.has(iconId);
}

test("normalizeProviderKey lowercases and collapses separators", () => {
	assert.equal(normalizeProviderKey(" Google-Workspace "), "google workspace");
	assert.equal(normalizeProviderKey("Office_365"), "office 365");
});

test("resolveProviderIcon matches issuer case-insensitively", () => {
	const icon = resolveProviderIcon(
		{
			issuer: "GitHub",
			accountName: "dev@example.com",
		},
		createIconAvailability("github", "shield-check"),
	);

	assert.equal(icon, "github");
});

test("resolveProviderIcon uses alias candidates when the first icon is unavailable", () => {
	const icon = resolveProviderIcon(
		{
			issuer: "Google Workspace Admin",
			accountName: "user@example.com",
		},
		createIconAvailability("building-2", "shield-check"),
	);

	assert.equal(icon, "building-2");
});

test("resolveProviderIcon falls back to account domain heuristics when issuer is empty", () => {
	const icon = resolveProviderIcon(
		{
			issuer: "",
			accountName: "dev@github.com",
		},
		createIconAvailability("github", "shield-check"),
	);

	assert.equal(icon, "github");
});

test("resolveProviderIcon falls back for unknown providers", () => {
	const icon = resolveProviderIcon(
		{
			issuer: "Unknown Service",
			accountName: "person@example.com",
		},
		createIconAvailability("shield-check"),
	);

	assert.equal(icon, "shield-check");
});

test("resolveProviderIcon falls back when a mapped icon is unavailable", () => {
	const icon = resolveProviderIcon(
		{
			issuer: "GitLab",
			accountName: "dev@example.com",
		},
		createIconAvailability("shield-check"),
	);

	assert.equal(icon, "shield-check");
});
