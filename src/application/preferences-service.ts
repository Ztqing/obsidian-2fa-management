import type { PreferredSide } from "../types";
import type { ViewInvalidationMode } from "./contracts";
import type { TwoFactorVaultServiceLike } from "./contracts";

export class PreferencesService {
	constructor(
		private readonly service: Pick<
			TwoFactorVaultServiceLike,
			| "getPreferredSide"
			| "setPreferredSide"
			| "setShowFloatingLockButton"
			| "setShowUpcomingCodes"
			| "shouldShowFloatingLockButton"
			| "shouldShowUpcomingCodes"
		>,
		private readonly refreshViews: (mode: ViewInvalidationMode) => Promise<void>,
	) {}

	getPreferredSide(): PreferredSide {
		return this.service.getPreferredSide();
	}

	async setPreferredSide(side: PreferredSide): Promise<void> {
		await this.service.setPreferredSide(side);
	}

	shouldShowUpcomingCodes(): boolean {
		return this.service.shouldShowUpcomingCodes();
	}

	async setShowUpcomingCodes(value: boolean): Promise<void> {
		await this.service.setShowUpcomingCodes(value);
		await this.refreshViews("entries");
	}

	shouldShowFloatingLockButton(): boolean {
		return this.service.shouldShowFloatingLockButton();
	}

	async setShowFloatingLockButton(value: boolean): Promise<void> {
		await this.service.setShowFloatingLockButton(value);
		await this.refreshViews("floatingLock");
	}
}
