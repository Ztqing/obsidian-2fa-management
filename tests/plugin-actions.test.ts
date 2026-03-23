import assert from "node:assert/strict";
import test from "node:test";
import { TwoFactorPluginActions } from "../src/plugin-actions";
import type { TotpEntryDraft, TotpEntryRecord, TranslationVariables } from "../src/types";

const sampleDraft: TotpEntryDraft = {
	accountName: "name@example.com",
	algorithm: "SHA-1",
	digits: 6,
	issuer: "GitHub",
	period: 30,
	secret: "JBSWY3DPEHPK3PXP",
};

function createEntryRecord(id: string, draft: TotpEntryDraft = sampleDraft): TotpEntryRecord {
	return {
		id,
		sortOrder: 0,
		...draft,
	};
}

function createEnvironment(options: {
	isUnlocked?: boolean;
	isVaultInitialized?: boolean;
} = {}) {
	const callLog: string[] = [];
	let isUnlocked = options.isUnlocked ?? false;
	let isVaultInitialized = options.isVaultInitialized ?? false;
	let entries: TotpEntryRecord[] = [];
	let promptForMasterPassword = async () => "vault-password";

	const service = {
		addEntry: async (draft: TotpEntryDraft) => {
			callLog.push(`service.addEntry:${draft.accountName}`);
			entries = [createEntryRecord("entry-1", draft)];
		},
		changeMasterPassword: async (nextPassword: string) => {
			callLog.push(`service.changeMasterPassword:${nextPassword}`);
		},
		commitBulkImport: async () => {
			callLog.push("service.commitBulkImport");
			return {
				addedEntries: [createEntryRecord("entry-2")],
				invalidEntries: [],
				nextEntries: [createEntryRecord("entry-2")],
				replacedEntries: [],
				skippedDuplicateBatchEntries: [],
				skippedDuplicateExistingEntries: [],
			};
		},
		deleteEntries: async (entryIds: readonly string[]) => {
			callLog.push(`service.deleteEntries:${entryIds.join(",")}`);
		},
		deleteEntry: async (entryId: string) => {
			callLog.push(`service.deleteEntry:${entryId}`);
		},
		getEntries: () => entries,
		getPreferredSide: () => "right" as const,
		initializeVault: async (password: string) => {
			callLog.push(`service.initializeVault:${password}`);
			isVaultInitialized = true;
			isUnlocked = true;
		},
		isUnlocked: () => isUnlocked,
		isVaultInitialized: () => isVaultInitialized,
		lockVault: () => {
			callLog.push("service.lockVault");
			isUnlocked = false;
		},
		reorderEntriesByIds: async (nextOrderedIds: readonly string[]) => {
			callLog.push(`service.reorder:${nextOrderedIds.join(",")}`);
		},
		resetVault: async () => {
			callLog.push("service.resetVault");
			isUnlocked = false;
			isVaultInitialized = false;
		},
		setPreferredSide: async () => {},
		setShowUpcomingCodes: async () => {},
		shouldShowUpcomingCodes: () => false,
		unlockVault: async (password: string) => {
			callLog.push(`service.unlockVault:${password}`);
			if (password === "wrong-password") {
				throw new Error("wrong password");
			}
			isUnlocked = true;
		},
		updateEntry: async (entryId: string, draft: TotpEntryDraft) => {
			callLog.push(`service.updateEntry:${entryId}:${draft.accountName}`);
		},
	};

	const environment = {
		confirmAction: async () => true,
		getErrorMessage: () => "translated-error",
		open2FAView: async () => {
			callLog.push("open2FAView");
		},
		openBulkOtpauthImportModal: async () => {
			callLog.push("openBulkImportModal");
			return {
				preview: {
					duplicateBatchEntries: [],
					duplicateExistingEntries: [],
					invalidEntries: [],
					newEntries: [],
					sourceText: "",
					stats: {
						actionableCount: 1,
						duplicateBatchCount: 0,
						duplicateExistingCount: 0,
						invalidCount: 0,
						newCount: 1,
					},
				},
				selectedDuplicateLineNumbers: [],
			};
		},
		openTotpEntryModal: async () => {
			callLog.push("openTotpEntryModal");
			return sampleDraft;
		},
		promptForMasterPassword: async () => promptForMasterPassword(),
		refreshAllViews: async () => {
			callLog.push("refreshAllViews");
		},
		service,
		setPromptForMasterPassword: (nextPrompt: typeof promptForMasterPassword) => {
			promptForMasterPassword = nextPrompt;
		},
		showNotice: (message: string) => {
			callLog.push(`notice:${message}`);
		},
		t: (key: string, variables: TranslationVariables = {}) =>
			Object.keys(variables).length === 0
				? key
				: `${key}:${JSON.stringify(variables)}`,
	};

	return {
		actions: new TwoFactorPluginActions(environment),
		callLog,
		environment,
		service,
		setEntries: (nextEntries: TotpEntryRecord[]) => {
			entries = nextEntries;
		},
		setLockedState: (nextLockedState: {
			isUnlocked?: boolean;
			isVaultInitialized?: boolean;
		}) => {
			if (typeof nextLockedState.isUnlocked === "boolean") {
				isUnlocked = nextLockedState.isUnlocked;
			}
			if (typeof nextLockedState.isVaultInitialized === "boolean") {
				isVaultInitialized = nextLockedState.isVaultInitialized;
			}
		},
	};
}

test("TwoFactorPluginActions initializes the vault and shows the success workflow", async () => {
	const { actions, callLog } = createEnvironment();

	const didInitialize = await actions.promptToInitializeVault();

	assert.equal(didInitialize, true);
	assert.deepEqual(callLog, [
		"service.initializeVault:vault-password",
		"open2FAView",
		"refreshAllViews",
		"notice:notice.vaultCreated",
	]);
});

test("TwoFactorPluginActions unlock fast path only opens the view when already unlocked", async () => {
	const { actions, callLog } = createEnvironment({
		isUnlocked: true,
		isVaultInitialized: true,
	});

	const didUnlock = await actions.promptToUnlockVault();

	assert.equal(didUnlock, true);
	assert.deepEqual(callLog, ["open2FAView"]);
});

test("TwoFactorPluginActions surfaces unlock errors through translated notices", async () => {
	const { actions, callLog, environment } = createEnvironment({
		isUnlocked: false,
		isVaultInitialized: true,
	});

	environment.setPromptForMasterPassword(async () => "wrong-password");

	const didUnlock = await actions.promptToUnlockVault();

	assert.equal(didUnlock, false);
	assert.deepEqual(callLog, [
		"service.unlockVault:wrong-password",
		"notice:translated-error",
	]);
});

test("TwoFactorPluginActions adds an entry through the ready-management workflow", async () => {
	const { actions, callLog } = createEnvironment({
		isUnlocked: true,
		isVaultInitialized: true,
	});

	const didAdd = await actions.handleAddEntryCommand();

	assert.equal(didAdd, true);
	assert.deepEqual(callLog, [
		"open2FAView",
		"openTotpEntryModal",
		"service.addEntry:name@example.com",
		"refreshAllViews",
		'notice:notice.entryAdded:{"accountName":"name@example.com"}',
	]);
});

test("TwoFactorPluginActions confirms reset and refreshes the UI after clearing the vault", async () => {
	const { actions, callLog } = createEnvironment({
		isUnlocked: true,
		isVaultInitialized: true,
	});

	const didReset = await actions.confirmAndResetVault();

	assert.equal(didReset, true);
	assert.deepEqual(callLog, [
		"service.resetVault",
		"refreshAllViews",
		"notice:notice.vaultCleared",
	]);
});
