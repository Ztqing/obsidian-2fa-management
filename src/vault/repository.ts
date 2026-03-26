import { DEFAULT_PLUGIN_DATA } from "../constants";
import { normalizePluginDataWithIssues } from "../data/store";
import type {
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

	getPreferredSide(): PreferredSide {
		return this.pluginData.settings.preferredSide;
	}

	shouldShowUpcomingCodes(): boolean {
		return this.pluginData.settings.showUpcomingCodes;
	}

	createNextPluginData(options: {
		bumpVaultRevision?: boolean;
		settings?: PluginSettings;
		vault?: PluginData["vault"];
	}): PluginData {
		return {
			...this.pluginData,
			settings: options.settings ?? this.pluginData.settings,
			vault:
				typeof options.vault === "undefined" ? this.pluginData.vault : options.vault,
			vaultRevision: options.bumpVaultRevision
				? this.pluginData.vaultRevision + 1
				: this.pluginData.vaultRevision,
		};
	}

	async persistPluginData(data: PluginData, vaultLoadIssue: VaultLoadIssue | null = null): Promise<void> {
		await this.dependencies.saveData(data);
		this.pluginData = data;
		this.vaultLoadIssue = vaultLoadIssue;
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
