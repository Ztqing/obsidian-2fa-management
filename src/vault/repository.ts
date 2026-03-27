import { DEFAULT_PLUGIN_DATA } from "../constants";
import { normalizePluginDataWithIssues } from "../data/store";
import type {
	LockTimeoutMode,
	PersistedUnlockData,
	PluginData,
	PluginSettings,
	PreferredSide,
	VaultLoadIssue,
} from "../types";

export interface VaultRepositoryDependencies {
	loadData: () => Promise<unknown>;
	saveData: (data: PluginData) => Promise<void>;
}

export class VaultRepository {
	private pluginData: PluginData = DEFAULT_PLUGIN_DATA;
	private vaultLoadIssue: VaultLoadIssue | null = null;

	constructor(private readonly dependencies: VaultRepositoryDependencies) {}

	async load(): Promise<void> {
		const { pluginData, vaultLoadIssue } = normalizePluginDataWithIssues(
			await this.dependencies.loadData(),
		);
		this.pluginData = pluginData;
		this.vaultLoadIssue = vaultLoadIssue;
	}

	getPluginData(): PluginData {
		return this.pluginData;
	}

	getVaultLoadIssue(): VaultLoadIssue | null {
		return this.vaultLoadIssue;
	}

	isVaultInitialized(): boolean {
		return this.vaultLoadIssue === null && this.pluginData.vault !== null;
	}

	getVaultRevision(): number {
		return this.pluginData.vaultRevision;
	}

	getPersistedUnlock(): PersistedUnlockData | null {
		return this.pluginData.persistedUnlock;
	}

	getPreferredSide(): PreferredSide {
		return this.pluginData.settings.preferredSide;
	}

	getLockTimeoutMode(): LockTimeoutMode {
		return this.pluginData.settings.lockTimeoutMode;
	}

	getLockTimeoutMinutes(): number {
		return this.pluginData.settings.lockTimeoutMinutes;
	}

	isInsecurePersistedUnlockFallbackEnabled(): boolean {
		return this.pluginData.settings.allowInsecurePersistedUnlockFallback;
	}

	shouldShowUpcomingCodes(): boolean {
		return this.pluginData.settings.showUpcomingCodes;
	}

	createNextPluginData(options: {
		bumpVaultRevision?: boolean;
		persistedUnlock?: PluginData["persistedUnlock"];
		settings?: PluginSettings;
		vault?: PluginData["vault"];
	}): PluginData {
		return {
			...this.pluginData,
			persistedUnlock:
				typeof options.persistedUnlock === "undefined"
					? this.pluginData.persistedUnlock
					: options.persistedUnlock,
			settings: options.settings ?? this.pluginData.settings,
			vault:
				typeof options.vault === "undefined" ? this.pluginData.vault : options.vault,
			vaultRevision: options.bumpVaultRevision
				? this.pluginData.vaultRevision + 1
				: this.pluginData.vaultRevision,
		};
	}

	replacePluginData(
		data: PluginData,
		vaultLoadIssue: VaultLoadIssue | null = null,
	): void {
		this.pluginData = data;
		this.vaultLoadIssue = vaultLoadIssue;
	}

	async persistPluginData(data: PluginData, vaultLoadIssue: VaultLoadIssue | null = null): Promise<void> {
		await this.dependencies.saveData(data);
		this.replacePluginData(data, vaultLoadIssue);
	}

	async persistSettings(nextSettings: Partial<PluginSettings>): Promise<void> {
		await this.persistPluginData(
			this.createNextPluginData({
				settings: {
					...this.pluginData.settings,
					...nextSettings,
				},
			}),
			this.vaultLoadIssue,
		);
	}
}
