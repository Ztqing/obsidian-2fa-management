import { createUserError } from "../errors";
import type {
	LockTimeoutMode,
	PluginData,
	PreferredSide,
	VaultLoadIssue,
} from "../types";
import type { VaultPersistedUnlockManager } from "./persisted-unlock-manager";

interface VaultSettingsRepositoryLike {
	createNextPluginData(options: {
		bumpVaultRevision?: boolean;
		persistedUnlock?: PluginData["persistedUnlock"];
		settings?: PluginData["settings"];
		vault?: PluginData["vault"];
	}): PluginData;
	getLockTimeoutMode(): LockTimeoutMode;
	getPersistedUnlock(): PluginData["persistedUnlock"];
	getPluginData(): PluginData;
	getVaultLoadIssue(): VaultLoadIssue | null;
	persistPluginData(
		data: PluginData,
		vaultLoadIssue?: VaultLoadIssue | null,
	): Promise<void>;
	persistSettings(nextSettings: Partial<PluginData["settings"]>): Promise<void>;
}

interface VaultSettingsSessionLike {
	isUnlocked(): boolean;
	requireSessionPassword(): string;
}

export interface VaultSettingsManagerDependencies {
	persistedUnlockManager: Pick<
		VaultPersistedUnlockManager,
		"assertAvailable" | "createPersistedUnlockData" | "getCapability" | "getStorageOptions"
	>;
	repository: VaultSettingsRepositoryLike;
	session: VaultSettingsSessionLike;
}

export class VaultSettingsManager {
	constructor(private readonly dependencies: VaultSettingsManagerDependencies) {}

	async setPreferredSide(side: PreferredSide): Promise<void> {
		await this.dependencies.repository.persistSettings({
			preferredSide: side,
		});
	}

	async setShowUpcomingCodes(value: boolean): Promise<void> {
		await this.dependencies.repository.persistSettings({
			showUpcomingCodes: value,
		});
	}

	async setInsecurePersistedUnlockFallbackEnabled(enabled: boolean): Promise<void> {
		const nextStorageOptions =
			this.dependencies.persistedUnlockManager.getStorageOptions(enabled);
		const nextCapability =
			this.dependencies.persistedUnlockManager.getCapability(enabled);
		const currentPersistedUnlock = this.dependencies.repository.getPersistedUnlock();
		const shouldDisableNeverMode =
			!enabled &&
			this.dependencies.repository.getLockTimeoutMode() === "never" &&
			nextCapability.availability === "unavailable";
		const shouldClearPersistedUnlock =
			(currentPersistedUnlock?.version === 2 &&
				currentPersistedUnlock.kind === "compatibility-fallback") ||
			shouldDisableNeverMode;
		const shouldRefreshPersistedUnlock =
			enabled &&
			this.dependencies.repository.getLockTimeoutMode() === "never" &&
			this.dependencies.session.isUnlocked();

		await this.dependencies.repository.persistPluginData(
			this.dependencies.repository.createNextPluginData({
				persistedUnlock: shouldRefreshPersistedUnlock
					? this.dependencies.persistedUnlockManager.createPersistedUnlockData(
							this.dependencies.session.requireSessionPassword(),
							this.dependencies.repository.getLockTimeoutMode(),
							nextStorageOptions,
						)
					: shouldClearPersistedUnlock
						? null
						: undefined,
				settings: {
					...this.dependencies.repository.getPluginData().settings,
					allowInsecurePersistedUnlockFallback: enabled,
					lockTimeoutMode: shouldDisableNeverMode
						? "on-restart"
						: this.dependencies.repository.getLockTimeoutMode(),
				},
			}),
			this.dependencies.repository.getVaultLoadIssue(),
		);
	}

	async setLockTimeoutMode(mode: LockTimeoutMode): Promise<void> {
		if (mode === "never") {
			this.dependencies.persistedUnlockManager.assertAvailable();
		}

		await this.dependencies.repository.persistPluginData(
			this.dependencies.repository.createNextPluginData({
				persistedUnlock:
					mode === "never" && this.dependencies.session.isUnlocked()
						? this.dependencies.persistedUnlockManager.createPersistedUnlockData(
								this.dependencies.session.requireSessionPassword(),
								mode,
							)
						: null,
				settings: {
					...this.dependencies.repository.getPluginData().settings,
					lockTimeoutMode: mode,
				},
			}),
			this.dependencies.repository.getVaultLoadIssue(),
		);
	}

	async setLockTimeoutMinutes(minutes: number): Promise<void> {
		if (!Number.isInteger(minutes) || minutes < 1) {
			throw createUserError("lock_timeout_minutes_invalid");
		}

		await this.dependencies.repository.persistSettings({
			lockTimeoutMinutes: minutes,
		});
	}
}
