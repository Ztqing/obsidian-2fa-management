import assert from "node:assert/strict";
import test from "node:test";
import {
	confirmEnableInsecurePersistedUnlockFallback,
	createCommandHandlers,
	createPluginActionEnvironment,
	createSettingsController,
} from "../src/plugin/internal/controllers";

test("confirmEnableInsecurePersistedUnlockFallback builds the expected confirmation workflow", async () => {
	const confirmationRequests: Array<{
		app: unknown;
		options: unknown;
	}> = [];
	let didRecordActivity = false;

	const confirmed = await confirmEnableInsecurePersistedUnlockFallback(
		{
			app: {
				name: "obsidian-app",
			} as never,
			recordSessionActivity: () => {
				didRecordActivity = true;
			},
			t: (key: string) => key,
		},
		async (app, options, onClose) => {
			confirmationRequests.push({
				app,
				options,
			});
			onClose?.();
			return true;
		},
	);

	assert.equal(confirmed, true);
	assert.equal(didRecordActivity, true);
	assert.deepEqual(confirmationRequests, [
		{
			app: {
				name: "obsidian-app",
			},
			options: {
				cancelLabel: "common.cancel",
				confirmLabel: "confirm.compatibilityFallback.confirmLabel",
				description: "confirm.compatibilityFallback.description",
				title: "confirm.compatibilityFallback.title",
				warning: true,
			},
		},
	]);
});

test("createPluginActionEnvironment forwards modal, password, refresh, and notice operations", async () => {
	const callLog: string[] = [];
	const environment = createPluginActionEnvironment(
		{
			app: {} as never,
			getErrorMessage: () => "translated-error",
			open2FAView: async () => {
				callLog.push("open2FAView");
				return {} as never;
			},
			recordSessionActivity: () => {
				callLog.push("recordSessionActivity");
			},
			showNotice: (message: string) => {
				callLog.push(`showNotice:${message}`);
			},
			t: (key: string) => key,
		},
		{
			confirmActionImpl: async (_app, options, onClose) => {
				callLog.push(`confirmAction:${options.title}`);
				onClose?.();
				return true;
			},
			openBulkOtpauthImportModalImpl: async (_plugin, entries, revision) => {
				callLog.push(`openBulkImport:${entries.length}:${revision}`);
				return null;
			},
			openTotpEntryModalImpl: async (_plugin, initialDraft) => {
				callLog.push(`openTotpEntryModal:${initialDraft?.accountName ?? "empty"}`);
				return null;
			},
			promptForMasterPasswordImpl: async (_plugin, options) => {
				callLog.push(`promptForPassword:${options.title}`);
				return "vault-password";
			},
			refreshAllViews: async (mode) => {
				callLog.push(`refreshAllViews:${mode ?? "full"}`);
			},
			service: {
				addEntry: async () => {},
				changeMasterPassword: async () => {},
				commitBulkImport: async () => {
					throw new Error("unused");
				},
				deleteEntries: async () => {},
				deleteEntry: async () => {},
				getEntries: () => [],
				getPersistedUnlockCapability: () => ({
					availability: "available" as const,
					source: "safe-storage" as const,
				}),
				getLockTimeoutMinutes: () => 15,
				getLockTimeoutMode: () => "on-restart" as const,
				getPreferredSide: () => "right" as const,
				getVaultRevision: () => 0,
				hasVaultLoadIssue: () => false,
				initializeVault: async () => {},
				isInsecurePersistedUnlockFallbackEnabled: () => false,
				isUnlocked: () => false,
				isVaultInitialized: () => false,
				lockVault: () => {},
				reorderEntriesByIds: async () => {},
				resetVault: async () => {},
				setInsecurePersistedUnlockFallbackEnabled: async () => {},
				setLockTimeoutMinutes: async () => {},
				setLockTimeoutMode: async () => {},
				setPreferredSide: async () => {},
				setShowUpcomingCodes: async () => {},
				shouldShowUpcomingCodes: () => false,
				unlockVault: async () => {},
				updateEntry: async () => {},
			},
		},
	);

	const didConfirm = await environment.confirmAction({
		cancelLabel: "cancel",
		confirmLabel: "confirm",
		description: "description",
		title: "confirm-title",
	});
	await environment.open2FAView();
	await environment.openBulkOtpauthImportModal([], 8);
	await environment.openTotpEntryModal({
		accountName: "name@example.com",
	});
	assert.equal(
		await environment.promptForMasterPassword({
			description: "description",
			submitLabel: "submit",
			title: "unlock-title",
		}),
		"vault-password",
	);
	await environment.refreshAllViews("entries");
	environment.showNotice?.("notice.message");

	assert.equal(didConfirm, true);
	assert.equal(environment.getErrorMessage(new Error("boom")), "translated-error");
	assert.deepEqual(callLog, [
		"confirmAction:confirm-title",
		"recordSessionActivity",
		"open2FAView",
		"openBulkImport:0:8",
		"openTotpEntryModal:name@example.com",
		"promptForPassword:unlock-title",
		"refreshAllViews:entries",
		"showNotice:notice.message",
	]);
});

test("createCommandHandlers and createSettingsController keep forwarding behavior narrow and stable", async () => {
	const callLog: string[] = [];
	const commandHandlers = createCommandHandlers({
		getErrorMessage: () => "translated-error",
		handleAddEntryCommand: async () => {
			callLog.push("handleAddEntryCommand");
			return true;
		},
		handleBulkImportOtpauthLinksCommand: async () => {
			callLog.push("handleBulkImportOtpauthLinksCommand");
			return true;
		},
		lockVault: (showNotice = false) => {
			callLog.push(`lockVault:${showNotice}`);
		},
		open2FAView: async () => {
			callLog.push("open2FAView");
			return {} as never;
		},
		promptToUnlockVault: async () => {
			callLog.push("promptToUnlockVault");
			return true;
		},
		recordSessionActivity: () => {
			callLog.push("recordSessionActivity");
		},
		showNotice: (message: string) => {
			callLog.push(`showNotice:${message}`);
		},
		t: (key: string) => key,
	});

	await commandHandlers.handleAddEntryCommand();
	await commandHandlers.handleBulkImportOtpauthLinksCommand();
	commandHandlers.lockVault(true);
	await commandHandlers.open2FAView();
	await commandHandlers.promptToUnlockVault();
	commandHandlers.recordSessionActivity();
	commandHandlers.showNotice?.("command-notice");

	const settingsController = createSettingsController(
		{
			confirmAndResetVault: async () => {
				callLog.push("confirmAndResetVault");
				return true;
			},
			getErrorMessage: () => "translated-error",
			getPersistedUnlockCapability: () => ({
				availability: "available" as const,
				source: "safe-storage" as const,
			}),
			getLockTimeoutMinutes: () => 15,
			getLockTimeoutMode: () => "on-restart" as const,
			getPreferredSide: () => "right" as const,
			getVaultLoadIssue: () => null,
			hasVaultLoadIssue: () => false,
			isInsecurePersistedUnlockFallbackEnabled: () => false,
			isUnlocked: () => true,
			isVaultInitialized: () => true,
			lockVault: (showNotice = false) => {
				callLog.push(`settings.lockVault:${showNotice}`);
			},
			open2FAView: async () => {
				callLog.push("settings.open2FAView");
				return {} as never;
			},
			promptToChangeMasterPassword: async () => {
				callLog.push("promptToChangeMasterPassword");
				return true;
			},
			promptToInitializeVault: async () => {
				callLog.push("promptToInitializeVault");
				return true;
			},
			promptToUnlockVault: async () => {
				callLog.push("settings.promptToUnlockVault");
				return true;
			},
			recordSessionActivity: () => {
				callLog.push("settings.recordSessionActivity");
			},
			setInsecurePersistedUnlockFallbackEnabled: async () => {
				callLog.push("setInsecurePersistedUnlockFallbackEnabled");
			},
			setLockTimeoutMinutes: async (minutes: number) => {
				callLog.push(`setLockTimeoutMinutes:${minutes}`);
			},
			setLockTimeoutMode: async (mode) => {
				callLog.push(`setLockTimeoutMode:${mode}`);
			},
			setPreferredSide: async (side) => {
				callLog.push(`setPreferredSide:${side}`);
			},
			setShowUpcomingCodes: async (value: boolean) => {
				callLog.push(`setShowUpcomingCodes:${value}`);
			},
			shouldShowUpcomingCodes: () => false,
			showNotice: (message: string) => {
				callLog.push(`settings.showNotice:${message}`);
			},
			t: (key: string) => key,
		},
		async () => {
			callLog.push("confirmEnableInsecurePersistedUnlockFallback");
			return true;
		},
	);

	assert.equal(
		await settingsController.confirmEnableInsecurePersistedUnlockFallback(),
		true,
	);
	assert.equal(await settingsController.confirmAndResetVault(), true);
	await settingsController.open2FAView();
	await settingsController.promptToChangeMasterPassword();
	await settingsController.promptToInitializeVault();
	await settingsController.promptToUnlockVault();
	await settingsController.setLockTimeoutMode("custom");
	await settingsController.setLockTimeoutMinutes(25);
	await settingsController.setPreferredSide("left");
	await settingsController.setShowUpcomingCodes(true);
	settingsController.lockVault(true);
	settingsController.recordSessionActivity();
	settingsController.showNotice?.("settings-notice");

	assert.deepEqual(callLog, [
		"handleAddEntryCommand",
		"handleBulkImportOtpauthLinksCommand",
		"lockVault:true",
		"open2FAView",
		"promptToUnlockVault",
		"recordSessionActivity",
		"showNotice:command-notice",
		"confirmEnableInsecurePersistedUnlockFallback",
		"confirmAndResetVault",
		"settings.open2FAView",
		"promptToChangeMasterPassword",
		"promptToInitializeVault",
		"settings.promptToUnlockVault",
		"setLockTimeoutMode:custom",
		"setLockTimeoutMinutes:25",
		"setPreferredSide:left",
		"setShowUpcomingCodes:true",
		"settings.lockVault:true",
		"settings.recordSessionActivity",
		"settings.showNotice:settings-notice",
	]);
});
