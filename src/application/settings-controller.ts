import type { SettingsActions } from "./contracts";

export type TwoFactorSettingsController = SettingsActions;

export function createSettingsController<T extends TwoFactorSettingsController>(
	controller: T,
): T {
	return controller;
}
