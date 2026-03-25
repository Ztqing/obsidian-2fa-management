import { encryptVaultEntries } from "../security/crypto";
import type { PluginData, TotpEntryRecord } from "../types";
import { reindexTotpEntries } from "../data/store";
import type { VaultRepository } from "./repository";
import type { VaultSession } from "./session";

export class EncryptedVaultManager {
	constructor(
		private readonly repository: VaultRepository,
		private readonly session: VaultSession,
	) {}

	async initialize(password: string): Promise<void> {
		const nextEntries: TotpEntryRecord[] = [];
		const nextVault = await encryptVaultEntries(nextEntries, password);
		const nextPluginData = this.repository.createNextPluginData({
			bumpVaultRevision: true,
			vault: nextVault,
		});

		await this.repository.persistPluginData(nextPluginData);
		this.session.begin(nextEntries, password);
	}

	async changeMasterPassword(nextPassword: string): Promise<void> {
		const currentEntries = this.session.requireUnlockedEntries();
		const currentSessionToken = this.session.getSessionToken();
		const nextVault = await encryptVaultEntries(currentEntries, nextPassword);
		const nextPluginData = this.repository.createNextPluginData({
			bumpVaultRevision: true,
			vault: nextVault,
		});

		await this.repository.persistPluginData(nextPluginData);
		this.session.sync(currentEntries, nextPassword, currentSessionToken);
	}

	async commitUnlockedEntries(
		entries: readonly TotpEntryRecord[],
		options: {
			bumpVaultRevision: boolean;
			nextPassword?: string;
		},
	): Promise<void> {
		const nextEntries = reindexTotpEntries(entries);
		const currentSessionToken = this.session.getSessionToken();
		const nextPassword = options.nextPassword ?? this.session.requireSessionPassword();
		const nextVault = await encryptVaultEntries(nextEntries, nextPassword);
		const nextPluginData = this.repository.createNextPluginData({
			bumpVaultRevision: options.bumpVaultRevision,
			vault: nextVault,
		});

		await this.repository.persistPluginData(nextPluginData);
		this.session.sync(nextEntries, nextPassword, currentSessionToken);
	}

	async resetVault(): Promise<void> {
		const pluginData = this.repository.getPluginData();
		const nextPluginData: PluginData = this.repository.createNextPluginData({
			bumpVaultRevision:
				pluginData.vault !== null || this.session.getEntries().length > 0,
			vault: null,
		});

		await this.repository.persistPluginData(nextPluginData);
		this.session.clear();
	}
}
