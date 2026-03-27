import assert from "node:assert/strict";
import test from "node:test";
import { collectTextContent } from "./support/fake-dom";
import { importWithObsidianRuntime } from "./support/import-with-obsidian-runtime";
import {
	App,
	Plugin,
	getObsidianRuntimeState,
	resetObsidianRuntime,
} from "./support/obsidian-runtime";

function flushMicrotasks(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

function createController(overrides: Partial<Record<string, unknown>> = {}) {
	const calls: string[] = [];
	const controller = {
		confirmAndResetVault: async () => {
			calls.push("confirmAndResetVault");
			return true;
		},
		confirmEnableInsecurePersistedUnlockFallback: async () => {
			calls.push("confirmEnableFallback");
			return true;
		},
		getErrorMessage: () => "translated-error",
		getLockTimeoutMinutes: () => 15,
		getLockTimeoutMode: () => "on-restart" as const,
		getPersistedUnlockCapability: () => ({
			availability: "available" as const,
			source: "safe-storage" as const,
		}),
		getPreferredSide: () => "right" as const,
		getVaultLoadIssue: () => null,
		hasVaultLoadIssue: () => false,
		isInsecurePersistedUnlockFallbackEnabled: () => false,
		isUnlocked: () => false,
		isVaultInitialized: () => false,
		lockVault: (showNotice = false) => {
			calls.push(`lockVault:${showNotice}`);
		},
		open2FAView: async () => {
			calls.push("open2FAView");
			return {};
		},
		promptToChangeMasterPassword: async () => {
			calls.push("promptToChangeMasterPassword");
			return true;
		},
		promptToInitializeVault: async () => {
			calls.push("promptToInitializeVault");
			return true;
		},
		promptToUnlockVault: async () => {
			calls.push("promptToUnlockVault");
			return true;
		},
		recordSessionActivity: () => {
			calls.push("recordSessionActivity");
		},
		setInsecurePersistedUnlockFallbackEnabled: async (enabled: boolean) => {
			calls.push(`setInsecurePersistedUnlockFallbackEnabled:${enabled}`);
		},
		setLockTimeoutMinutes: async (minutes: number) => {
			calls.push(`setLockTimeoutMinutes:${minutes}`);
		},
		setLockTimeoutMode: async (mode: string) => {
			calls.push(`setLockTimeoutMode:${mode}`);
		},
		setPreferredSide: async (side: string) => {
			calls.push(`setPreferredSide:${side}`);
		},
		setShowUpcomingCodes: async (value: boolean) => {
			calls.push(`setShowUpcomingCodes:${value}`);
		},
		shouldShowUpcomingCodes: () => false,
		showNotice: (message: string) => {
			calls.push(`showNotice:${message}`);
		},
		t: (key: string) => key,
		...overrides,
	};

	return {
		calls,
		controller,
	};
}

test("TwoFactorSettingTab renders the repair branch and confirms vault reset from settings", async () => {
	resetObsidianRuntime();
	const { TwoFactorSettingTab } = await importWithObsidianRuntime<{
		TwoFactorSettingTab: new (
			app: App,
			plugin: Plugin,
			controller: ReturnType<typeof createController>["controller"],
		) => {
			containerEl: HTMLElement;
			display(): void;
		};
	}>("./src/settings.ts");
	const { calls, controller } = createController({
		getVaultLoadIssue: () => "corrupted",
		hasVaultLoadIssue: () => true,
	});

	const tab = new TwoFactorSettingTab(new App(), new Plugin(), controller);
	tab.display();

	const text = collectTextContent(tab.containerEl as never);
	assert.ok(text.includes("settings.repair.heading"));
	assert.ok(text.includes("settings.repair.description"));

	const clearButton = getObsidianRuntimeState().buttons.find(
		(button) => button.settingName === "settings.repair.clearVault.name",
	);
	assert.ok(clearButton);

	clearButton.component.triggerClick();
	await flushMicrotasks();

	assert.deepEqual(calls, ["confirmAndResetVault"]);
});

test("TwoFactorSettingTab wires preferred-side and upcoming-code controls through the controller", async () => {
	resetObsidianRuntime();
	const { TwoFactorSettingTab } = await importWithObsidianRuntime<{
		TwoFactorSettingTab: new (
			app: App,
			plugin: Plugin,
			controller: ReturnType<typeof createController>["controller"],
		) => {
			containerEl: HTMLElement;
			display(): void;
		};
	}>("./src/settings.ts");
	const { calls, controller } = createController({
		isUnlocked: () => true,
		isVaultInitialized: () => true,
		shouldShowUpcomingCodes: () => false,
	});

	const tab = new TwoFactorSettingTab(new App(), new Plugin(), controller);
	tab.display();

	const preferredSidebar = getObsidianRuntimeState().dropdowns.find(
		(dropdown) => dropdown.settingName === "settings.preferredSidebar.name",
	);
	const showUpcomingCodes = getObsidianRuntimeState().toggles.find(
		(toggle) => toggle.settingName === "settings.showUpcomingCodes.name",
	);
	assert.ok(preferredSidebar);
	assert.ok(showUpcomingCodes);

	preferredSidebar.component.triggerChange("left");
	showUpcomingCodes.component.triggerChange(true);
	await flushMicrotasks();

	assert.deepEqual(calls, [
		"setPreferredSide:left",
		"setShowUpcomingCodes:true",
	]);
});
