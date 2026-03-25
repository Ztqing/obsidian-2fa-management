import { ActionRunner } from "../application/action-runner";
import type { CommandHandlers } from "../application/command-handlers";
import type { TranslatedNoticeEnvironment } from "../application/contracts";

interface CommandRegistrationHost extends CommandHandlers {
	addCommand(command: {
		callback: () => void;
		id: string;
		name: string;
	}): unknown;
}

export async function executeGuardedPluginCommand(
	plugin: TranslatedNoticeEnvironment,
	task: () => Promise<unknown>,
): Promise<boolean> {
	return new ActionRunner(plugin).runVoid(async () => {
		await task();
	});
}

export function registerPluginCommands(plugin: CommandRegistrationHost): void {
	plugin.addCommand({
		id: "open-2fa-view",
		name: plugin.t("command.openView"),
		callback: () => {
			void executeGuardedPluginCommand(plugin, () => plugin.open2FAView());
		},
	});

	plugin.addCommand({
		id: "unlock-2fa-vault",
		name: plugin.t("command.unlockVault"),
		callback: () => {
			void executeGuardedPluginCommand(plugin, () => plugin.promptToUnlockVault());
		},
	});

	plugin.addCommand({
		id: "lock-2fa-vault",
		name: plugin.t("command.lockVault"),
		callback: () => {
			plugin.lockVault(true);
		},
	});

	plugin.addCommand({
		id: "add-totp-entry",
		name: plugin.t("command.addEntry"),
		callback: () => {
			void executeGuardedPluginCommand(plugin, () => plugin.handleAddEntryCommand());
		},
	});

	plugin.addCommand({
		id: "bulk-import-otpauth-links",
		name: plugin.t("command.bulkImportOtpauthLinks"),
		callback: () => {
			void executeGuardedPluginCommand(plugin, () =>
				plugin.handleBulkImportOtpauthLinksCommand(),
			);
		},
	});
}
