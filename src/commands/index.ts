import type TwoFactorManagementPlugin from "../plugin";

export function registerPluginCommands(plugin: TwoFactorManagementPlugin): void {
	plugin.addCommand({
		id: "open-2fa-view",
		name: plugin.t("command.openView"),
		callback: () => {
			void plugin.open2FAView();
		},
	});

	plugin.addCommand({
		id: "unlock-2fa-vault",
		name: plugin.t("command.unlockVault"),
		callback: () => {
			void plugin.promptToUnlockVault();
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
			void plugin.handleAddEntryCommand();
		},
	});

	plugin.addCommand({
		id: "bulk-import-otpauth-links",
		name: plugin.t("command.bulkImportOtpauthLinks"),
		callback: () => {
			void plugin.handleBulkImportOtpauthLinksCommand();
		},
	});
}
