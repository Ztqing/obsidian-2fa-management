import type TwoFactorManagementPlugin from "../plugin";

type GuardedCommandPlugin = TwoFactorManagementPlugin & {
	showNotice?: (message: string) => void;
};

export async function executeGuardedPluginCommand(
	plugin: Pick<GuardedCommandPlugin, "getErrorMessage" | "showNotice">,
	task: () => Promise<unknown>,
): Promise<boolean> {
	try {
		await task();
		return true;
	} catch (error) {
		const message = plugin.getErrorMessage(error);
		if (plugin.showNotice) {
			plugin.showNotice(message);
		} else {
			console.error(error);
		}
		return false;
	}
}

export function registerPluginCommands(plugin: GuardedCommandPlugin): void {
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
