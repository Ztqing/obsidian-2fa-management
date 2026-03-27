import assert from "node:assert/strict";
import test from "node:test";
import {
	executeGuardedPluginCommand,
	registerPluginCommands,
} from "../src/commands/index";

function flushMicrotasks(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

test("executeGuardedPluginCommand returns true on success", async () => {
	const notices: string[] = [];

	const didSucceed = await executeGuardedPluginCommand(
		{
			getErrorMessage: () => "translated-error",
			showNotice: (message) => {
				notices.push(message);
			},
		},
		async () => {},
	);

	assert.equal(didSucceed, true);
	assert.deepEqual(notices, []);
});

test("executeGuardedPluginCommand translates and reports failures", async () => {
	const notices: string[] = [];

	const didSucceed = await executeGuardedPluginCommand(
		{
			getErrorMessage: () => "translated-error",
			showNotice: (message) => {
				notices.push(message);
			},
		},
		async () => {
			throw new Error("boom");
		},
	);

	assert.equal(didSucceed, false);
	assert.deepEqual(notices, ["translated-error"]);
});

test("registerPluginCommands keeps stable ids and guards async command failures", async () => {
	const commands: Array<{
		callback: () => void;
		id: string;
		name: string;
	}> = [];
	const notices: string[] = [];

	registerPluginCommands({
		addCommand: (command) => {
			commands.push(command);
		},
		getErrorMessage: () => "translated-error",
		handleAddEntryCommand: async () => true,
		handleBulkImportOtpauthLinksCommand: async () => true,
		lockVault: () => {},
		open2FAView: async () => {
			throw new Error("open failed");
		},
		promptToUnlockVault: async () => true,
		recordSessionActivity: () => {},
		showNotice: (message) => {
			notices.push(message);
		},
		t: (key: string) => key,
	});

	assert.deepEqual(
		commands.map((command) => command.id),
		[
			"open-2fa-view",
			"unlock-2fa-vault",
			"lock-2fa-vault",
			"add-totp-entry",
			"bulk-import-otpauth-links",
		],
	);

	commands[0]?.callback();
	await flushMicrotasks();

	assert.deepEqual(notices, ["translated-error"]);
});
