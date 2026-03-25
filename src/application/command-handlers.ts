import type { TranslationKey } from "../i18n/translations";
import type { TranslationVariables } from "../types";
import type { GuardedActionEnvironment } from "./contracts";

export interface CommandHandlers extends GuardedActionEnvironment {
	handleAddEntryCommand(): Promise<unknown>;
	handleBulkImportOtpauthLinksCommand(): Promise<unknown>;
	lockVault(showNotice?: boolean): void;
	open2FAView(): Promise<unknown>;
	promptToUnlockVault(): Promise<unknown>;
	t(key: TranslationKey, variables?: TranslationVariables): string;
}

export function createCommandHandlers<T extends CommandHandlers>(handlers: T): T {
	return handlers;
}
