import assert from "node:assert/strict";
import test from "node:test";
import { VaultEntryMutations } from "../src/vault/entry-mutations";
import { VaultSettingsManager } from "../src/vault/settings-manager";

test("VaultSettingsManager persists simple settings updates and validates custom timeout minutes", async () => {
	const persistedSettings: Array<Record<string, unknown>> = [];
	const manager = new VaultSettingsManager({
		persistedUnlockManager: {
			assertAvailable: () => {},
			createPersistedUnlockData: () => null,
			getCapability: () => ({
				availability: "available" as const,
				source: "safe-storage" as const,
			}),
			getStorageOptions: () => ({
				allowInsecureFallback: false,
			}),
		},
		repository: {
			persistSettings: async (settings: Record<string, unknown>) => {
				persistedSettings.push(settings);
			},
		},
		session: {
			isUnlocked: () => false,
			requireSessionPassword: () => "vault-password",
		},
	} as never);

	await manager.setPreferredSide("left");
	await manager.setShowUpcomingCodes(true);
	await manager.setLockTimeoutMinutes(30);

	assert.deepEqual(persistedSettings, [
		{
			preferredSide: "left",
		},
		{
			showUpcomingCodes: true,
		},
		{
			lockTimeoutMinutes: 30,
		},
	]);

	await assert.rejects(async () => {
		await manager.setLockTimeoutMinutes(0);
	});
});

test("VaultEntryMutations normalizes new entries and passes them through the encrypted store", async () => {
	const commitCalls: Array<{
		entries: Array<{
			accountName: string;
			id: string;
			issuer: string;
			sortOrder: number;
		}>;
		options: {
			bumpVaultRevision: boolean;
			nextPassword?: string;
		};
	}> = [];
	const manager = new VaultEntryMutations({
		assertVaultRevision: () => {},
		createId: () => "entry-2",
		encryptedVaultManager: {
			commitUnlockedEntries: async (entries, options) => {
				commitCalls.push({
					entries: entries.map((entry) => ({
						accountName: entry.accountName,
						id: entry.id,
						issuer: entry.issuer,
						sortOrder: entry.sortOrder,
					})),
					options,
				});
			},
		},
		session: {
			requireUnlockedEntries: () => [
				{
					accountName: "existing@example.com",
					algorithm: "SHA-1" as const,
					digits: 6,
					id: "entry-1",
					issuer: "Existing",
					period: 30,
					secret: "JBSWY3DPEHPK3PXP",
					sortOrder: 0,
				},
			],
		},
	});

	await manager.addEntry({
		accountName: "  next@example.com  ",
		algorithm: "SHA-1",
		digits: 6,
		issuer: "  GitHub  ",
		period: 30,
		secret: " jbswy3dpehpk3pxp ",
	});

	assert.deepEqual(commitCalls, [
		{
			entries: [
				{
					accountName: "existing@example.com",
					id: "entry-1",
					issuer: "Existing",
					sortOrder: 0,
				},
				{
					accountName: "next@example.com",
					id: "entry-2",
					issuer: "GitHub",
					sortOrder: 1,
				},
			],
			options: {
				bumpVaultRevision: true,
			},
		},
	]);
});
