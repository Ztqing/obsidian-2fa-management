import type { App, WorkspaceLeaf } from "obsidian";
import type {
	CommandHandlers,
	SettingsActions,
	ViewInvalidationMode,
} from "../../application/contracts";
import type { BulkOtpauthImportModalResult } from "../../ui/modals/bulk-otpauth-import-modal";
import type { ConfirmationOptions } from "../../ui/modals/confirm-modal";
import type { MasterPasswordPromptOptions } from "../../ui/modals/master-password-modal";
import type {
	TwoFactorPluginActionEnvironment,
	TwoFactorVaultServiceLike,
} from "../../plugin-actions";
import type {
	LockTimeoutMode,
	TotpEntryDraft,
	TotpEntryRecord,
	PreferredSide,
	TranslationVariables,
} from "../../types";
import type { TranslationKey } from "../../i18n/translations";

interface TranslationHost {
	t(key: TranslationKey, variables?: TranslationVariables): string;
}

interface ErrorNoticeHost extends TranslationHost {
	getErrorMessage(error: unknown): string;
	showNotice(message: string): void;
}

export interface PluginActionEnvironmentHost extends ErrorNoticeHost {
	app: App;
	open2FAView(): Promise<WorkspaceLeaf>;
	recordSessionActivity(): void;
}

export interface CommandHandlersHost extends ErrorNoticeHost {
	handleAddEntryCommand(): Promise<unknown>;
	handleBulkImportOtpauthLinksCommand(): Promise<unknown>;
	lockVault(showNotice?: boolean): void;
	open2FAView(): Promise<WorkspaceLeaf>;
	promptToUnlockVault(): Promise<unknown>;
	recordSessionActivity(): void;
}

export interface SettingsControllerHost extends ErrorNoticeHost {
	confirmAndResetVault(): Promise<boolean>;
	getPersistedUnlockCapability(): ReturnType<SettingsActions["getPersistedUnlockCapability"]>;
	getLockTimeoutMinutes(): number;
	getLockTimeoutMode(): LockTimeoutMode;
	getPreferredSide(): PreferredSide;
	getVaultLoadIssue(): ReturnType<SettingsActions["getVaultLoadIssue"]>;
	hasVaultLoadIssue(): boolean;
	isInsecurePersistedUnlockFallbackEnabled(): boolean;
	isUnlocked(): boolean;
	isVaultInitialized(): boolean;
	lockVault(showNotice?: boolean): void;
	open2FAView(): Promise<WorkspaceLeaf>;
	promptToChangeMasterPassword(): Promise<boolean>;
	promptToInitializeVault(): Promise<boolean>;
	promptToUnlockVault(): Promise<boolean>;
	recordSessionActivity(): void;
	setInsecurePersistedUnlockFallbackEnabled(enabled: boolean): Promise<void>;
	setLockTimeoutMinutes(minutes: number): Promise<void>;
	setLockTimeoutMode(mode: LockTimeoutMode): Promise<void>;
	setPreferredSide(side: PreferredSide): Promise<void>;
	setShowUpcomingCodes(value: boolean): Promise<void>;
	shouldShowUpcomingCodes(): boolean;
}

export interface ConfirmCompatibilityFallbackHost extends TranslationHost {
	app: App;
	recordSessionActivity(): void;
}

interface PluginActionEnvironmentDependencies {
	confirmActionImpl?: (
		app: App,
		options: ConfirmationOptions,
		onClose?: () => void,
	) => Promise<boolean>;
	openBulkOtpauthImportModalImpl?: (
		plugin: PluginActionEnvironmentHost,
		existingEntries: readonly TotpEntryRecord[],
		expectedVaultRevision: number,
	) => Promise<BulkOtpauthImportModalResult | null>;
	openTotpEntryModalImpl?: (
		plugin: PluginActionEnvironmentHost,
		initialDraft?: Partial<TotpEntryDraft>,
	) => Promise<TotpEntryDraft | null>;
	promptForMasterPasswordImpl?: (
		plugin: PluginActionEnvironmentHost,
		options: MasterPasswordPromptOptions,
	) => Promise<string | null>;
	refreshAllViews(mode?: ViewInvalidationMode): Promise<void>;
	service: TwoFactorVaultServiceLike;
}

async function defaultConfirmActionImpl(
	app: App,
	options: ConfirmationOptions,
	onClose?: () => void,
): Promise<boolean> {
	const { confirmAction } = await import("../../ui/modals/confirm-modal");
	return confirmAction(app, options, onClose);
}

async function defaultOpenBulkOtpauthImportModalImpl(
	plugin: PluginActionEnvironmentHost,
	existingEntries: readonly TotpEntryRecord[],
	expectedVaultRevision: number,
): Promise<BulkOtpauthImportModalResult | null> {
	const { openBulkOtpauthImportModal } = await import(
		"../../ui/modals/bulk-otpauth-import-modal"
	);
	return openBulkOtpauthImportModal(
		plugin as never,
		existingEntries,
		expectedVaultRevision,
	);
}

async function defaultOpenTotpEntryModalImpl(
	plugin: PluginActionEnvironmentHost,
	initialDraft?: Partial<TotpEntryDraft>,
): Promise<TotpEntryDraft | null> {
	const { openTotpEntryModal } = await import("../../ui/modals/totp-entry-modal");
	return openTotpEntryModal(plugin as never, initialDraft);
}

async function defaultPromptForMasterPasswordImpl(
	plugin: PluginActionEnvironmentHost,
	options: MasterPasswordPromptOptions,
): Promise<string | null> {
	const { promptForMasterPassword } = await import(
		"../../ui/modals/master-password-modal"
	);
	return promptForMasterPassword(plugin as never, options);
}

export async function confirmEnableInsecurePersistedUnlockFallback(
	host: ConfirmCompatibilityFallbackHost,
	confirmActionImpl: NonNullable<PluginActionEnvironmentDependencies["confirmActionImpl"]> = defaultConfirmActionImpl,
): Promise<boolean> {
	return confirmActionImpl(
		host.app,
		{
			title: host.t("confirm.compatibilityFallback.title"),
			description: host.t("confirm.compatibilityFallback.description"),
			confirmLabel: host.t("confirm.compatibilityFallback.confirmLabel"),
			cancelLabel: host.t("common.cancel"),
			warning: true,
		},
		() => host.recordSessionActivity(),
	);
}

export function createPluginActionEnvironment(
	host: PluginActionEnvironmentHost,
	dependencies: PluginActionEnvironmentDependencies,
): TwoFactorPluginActionEnvironment {
	const confirmActionImpl = dependencies.confirmActionImpl ?? defaultConfirmActionImpl;
	const openBulkImport =
		dependencies.openBulkOtpauthImportModalImpl ??
		defaultOpenBulkOtpauthImportModalImpl;
	const openEntryModal =
		dependencies.openTotpEntryModalImpl ?? defaultOpenTotpEntryModalImpl;
	const promptPassword =
		dependencies.promptForMasterPasswordImpl ??
		defaultPromptForMasterPasswordImpl;

	return {
		confirmAction: async (options) =>
			confirmActionImpl(
				host.app,
				options,
				() => host.recordSessionActivity(),
			),
		getErrorMessage: (error: unknown) => host.getErrorMessage(error),
		open2FAView: async () => {
			await host.open2FAView();
		},
		openBulkOtpauthImportModal: async (existingEntries, expectedVaultRevision) =>
			openBulkImport(
				host,
				existingEntries,
				expectedVaultRevision,
			),
		openTotpEntryModal: async (initialDraft) =>
			openEntryModal(host, initialDraft),
		promptForMasterPassword: async (options) =>
			promptPassword(host, options),
		refreshAllViews: async (mode) => {
			await dependencies.refreshAllViews(mode);
		},
		service: dependencies.service,
		showNotice: (message: string) => {
			host.showNotice(message);
		},
		t: (key, variables = {}) => host.t(key, variables),
	};
}

export function createCommandHandlers(host: CommandHandlersHost): CommandHandlers {
	return {
		getErrorMessage: (error: unknown) => host.getErrorMessage(error),
		handleAddEntryCommand: async () => host.handleAddEntryCommand(),
		handleBulkImportOtpauthLinksCommand: async () =>
			host.handleBulkImportOtpauthLinksCommand(),
		lockVault: (showNotice = false) => {
			host.lockVault(showNotice);
		},
		open2FAView: async () => host.open2FAView(),
		promptToUnlockVault: async () => host.promptToUnlockVault(),
		recordSessionActivity: () => host.recordSessionActivity(),
		showNotice: (message: string) => {
			host.showNotice(message);
		},
		t: (key, variables = {}) => host.t(key, variables),
	};
}

export function createSettingsController(
	host: SettingsControllerHost,
	confirmEnableCompatibilityFallback: () => Promise<boolean>,
): SettingsActions {
	return {
		confirmEnableInsecurePersistedUnlockFallback: async () =>
			confirmEnableCompatibilityFallback(),
		confirmAndResetVault: async () => host.confirmAndResetVault(),
		getErrorMessage: (error: unknown) => host.getErrorMessage(error),
		getPersistedUnlockCapability: () => host.getPersistedUnlockCapability(),
		getLockTimeoutMinutes: () => host.getLockTimeoutMinutes(),
		getLockTimeoutMode: () => host.getLockTimeoutMode(),
		getPreferredSide: () => host.getPreferredSide(),
		getVaultLoadIssue: () => host.getVaultLoadIssue(),
		hasVaultLoadIssue: () => host.hasVaultLoadIssue(),
		isInsecurePersistedUnlockFallbackEnabled: () =>
			host.isInsecurePersistedUnlockFallbackEnabled(),
		isUnlocked: () => host.isUnlocked(),
		isVaultInitialized: () => host.isVaultInitialized(),
		lockVault: (showNotice = false) => {
			host.lockVault(showNotice);
		},
		open2FAView: async () => host.open2FAView(),
		promptToChangeMasterPassword: async () => host.promptToChangeMasterPassword(),
		promptToInitializeVault: async () => host.promptToInitializeVault(),
		promptToUnlockVault: async () => host.promptToUnlockVault(),
		recordSessionActivity: () => host.recordSessionActivity(),
		setInsecurePersistedUnlockFallbackEnabled: async (enabled: boolean) =>
			host.setInsecurePersistedUnlockFallbackEnabled(enabled),
		setLockTimeoutMinutes: async (minutes: number) =>
			host.setLockTimeoutMinutes(minutes),
		setLockTimeoutMode: async (mode: LockTimeoutMode) =>
			host.setLockTimeoutMode(mode),
		setPreferredSide: async (side: PreferredSide) => host.setPreferredSide(side),
		setShowUpcomingCodes: async (value: boolean) =>
			host.setShowUpcomingCodes(value),
		shouldShowUpcomingCodes: () => host.shouldShowUpcomingCodes(),
		showNotice: (message: string) => {
			host.showNotice(message);
		},
		t: (key: TranslationKey, variables = {}) => host.t(key, variables),
	};
}
