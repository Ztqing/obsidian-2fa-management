import { createUserError } from "../errors";
import { decryptVaultEntries } from "../security/crypto";
import {
	isPersistedUnlockBackendUnavailableError,
	type PersistedUnlockStorage,
	type PersistedUnlockStorageOptions,
} from "../security/persisted-unlock";
import type {
	LockTimeoutMode,
	PersistedUnlockCapability,
	PluginData,
	TotpEntryRecord,
	VaultLoadIssue,
} from "../types";

interface PersistedUnlockRepositoryLike {
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
	isInsecurePersistedUnlockFallbackEnabled(): boolean;
	isVaultInitialized(): boolean;
	persistPluginData(
		data: PluginData,
		vaultLoadIssue?: VaultLoadIssue | null,
	): Promise<void>;
	replacePluginData(
		data: PluginData,
		vaultLoadIssue?: VaultLoadIssue | null,
	): void;
}

interface PersistedUnlockSessionLike {
	begin(entries: readonly TotpEntryRecord[], password: string): void;
	isUnlocked(): boolean;
	requireSessionPassword(): string;
}

export interface PersistedUnlockManagerDependencies {
	decryptEntries?: (
		encryptedVault: NonNullable<PluginData["vault"]>,
		password: string,
	) => Promise<TotpEntryRecord[]>;
	persistedUnlockStorage: PersistedUnlockStorage;
	repository: PersistedUnlockRepositoryLike;
	session: PersistedUnlockSessionLike;
}

export class VaultPersistedUnlockManager {
	constructor(private readonly dependencies: PersistedUnlockManagerDependencies) {}

	getCapability(
		allowInsecureFallback = this.dependencies.repository.isInsecurePersistedUnlockFallbackEnabled(),
	): PersistedUnlockCapability {
		return this.dependencies.persistedUnlockStorage.getCapability(
			this.getStorageOptions(allowInsecureFallback),
		);
	}

	getStorageOptions(
		allowInsecureFallback = this.dependencies.repository.isInsecurePersistedUnlockFallbackEnabled(),
	): PersistedUnlockStorageOptions {
		return {
			allowInsecureFallback,
		};
	}

	createPersistedUnlockData(
		password: string,
		lockTimeoutMode = this.dependencies.repository.getLockTimeoutMode(),
		storageOptions: PersistedUnlockStorageOptions = this.getStorageOptions(),
	): PluginData["persistedUnlock"] {
		if (
			lockTimeoutMode !== "never" ||
			this.dependencies.persistedUnlockStorage.getCapability(storageOptions)
				.availability === "unavailable"
		) {
			return null;
		}

		try {
			return this.dependencies.persistedUnlockStorage.protect(
				password,
				storageOptions,
			);
		} catch {
			return null;
		}
	}

	assertAvailable(): void {
		const capability = this.getCapability();

		if (capability.availability !== "unavailable") {
			return;
		}

		throw createUserError(
			this.dependencies.repository.isInsecurePersistedUnlockFallbackEnabled()
				? "persisted_unlock_unavailable"
				: "persisted_unlock_compatibility_mode_required",
		);
	}

	async restorePersistedUnlockIfAvailable(): Promise<void> {
		if (
			!this.dependencies.repository.isVaultInitialized() ||
			this.dependencies.repository.getLockTimeoutMode() !== "never"
		) {
			return;
		}

		const persistedUnlock = this.dependencies.repository.getPersistedUnlock();
		const pluginData = this.dependencies.repository.getPluginData();

		if (!persistedUnlock || !pluginData.vault) {
			return;
		}

		try {
			const password = this.dependencies.persistedUnlockStorage.unprotect(
				persistedUnlock,
				this.getStorageOptions(),
			);
			const nextEntries = await (
				this.dependencies.decryptEntries ?? decryptVaultEntries
			)(pluginData.vault, password);
			this.dependencies.session.begin(nextEntries, password);
		} catch (error) {
			if (isPersistedUnlockBackendUnavailableError(error)) {
				return;
			}

			await this.clearBestEffort();
		}
	}

	async refreshPersistedUnlockBestEffort(password: string): Promise<void> {
		const nextPersistedUnlock = this.createPersistedUnlockData(password);

		if (nextPersistedUnlock === null) {
			return;
		}

		await this.dependencies.repository.persistPluginData(
			this.dependencies.repository.createNextPluginData({
				persistedUnlock: nextPersistedUnlock,
			}),
			this.dependencies.repository.getVaultLoadIssue(),
		);
	}

	async clearPersistedUnlockBestEffort(): Promise<void> {
		if (this.dependencies.repository.getPersistedUnlock() === null) {
			return;
		}

		const nextPluginData = this.dependencies.repository.createNextPluginData({
			persistedUnlock: null,
		});

		try {
			await this.dependencies.repository.persistPluginData(
				nextPluginData,
				this.dependencies.repository.getVaultLoadIssue(),
			);
		} catch {
			this.dependencies.repository.replacePluginData(
				nextPluginData,
				this.dependencies.repository.getVaultLoadIssue(),
			);
		}
	}

	async setInsecurePersistedUnlockFallbackEnabled(enabled: boolean): Promise<void> {
		const nextStorageOptions = this.getStorageOptions(enabled);
		const nextCapability = this.getCapability(enabled);
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
					? this.createPersistedUnlockData(
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
			this.assertAvailable();
		}

		await this.dependencies.repository.persistPluginData(
			this.dependencies.repository.createNextPluginData({
				persistedUnlock:
					mode === "never" && this.dependencies.session.isUnlocked()
						? this.createPersistedUnlockData(
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

	async restoreIfAvailable(): Promise<void> {
		await this.restorePersistedUnlockIfAvailable();
	}

	async refreshBestEffort(password: string): Promise<void> {
		await this.refreshPersistedUnlockBestEffort(password);
	}

	async clearBestEffort(): Promise<void> {
		await this.clearPersistedUnlockBestEffort();
	}
}
