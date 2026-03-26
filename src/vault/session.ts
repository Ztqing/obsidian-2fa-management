import { createUserError } from "../errors";
import type { TotpEntryRecord } from "../types";

export class VaultSession {
	private unlockedEntries: TotpEntryRecord[] | null = null;
	private sessionPassword: string | null = null;
	private sessionToken = 0;

	isUnlocked(): boolean {
		return this.unlockedEntries !== null;
	}

	getEntries(): TotpEntryRecord[] {
		return this.unlockedEntries ? [...this.unlockedEntries] : [];
	}

	getSessionToken(): number {
		return this.sessionToken;
	}

	startUnlockAttempt(): number {
		this.sessionToken += 1;
		return this.sessionToken;
	}

	begin(entries: readonly TotpEntryRecord[], password: string): void {
		this.sessionToken += 1;
		this.unlockedEntries = [...entries];
		this.sessionPassword = password;
	}

	completeUnlock(
		entries: readonly TotpEntryRecord[],
		password: string,
		expectedSessionToken: number,
	): boolean {
		if (this.sessionToken !== expectedSessionToken) {
			return false;
		}

		this.unlockedEntries = [...entries];
		this.sessionPassword = password;
		return true;
	}

	sync(
		entries: readonly TotpEntryRecord[],
		password: string,
		expectedSessionToken: number,
	): void {
		if (this.sessionToken !== expectedSessionToken) {
			return;
		}

		this.unlockedEntries = [...entries];
		this.sessionPassword = password;
	}

	clear(): void {
		this.sessionToken += 1;
		this.unlockedEntries = null;
		this.sessionPassword = null;
	}

	requireUnlockedEntries(): TotpEntryRecord[] {
		if (!this.unlockedEntries || !this.sessionPassword) {
			throw createUserError("vault_unlock_required");
		}

		return [...this.unlockedEntries];
	}

	requireSessionPassword(): string {
		if (!this.sessionPassword) {
			throw createUserError("vault_unlock_required");
		}

		return this.sessionPassword;
	}
}
