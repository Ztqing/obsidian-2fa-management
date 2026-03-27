import { PERSISTED_UNLOCK_DATA_VERSION } from "../constants";
import type {
	PersistedUnlockAvailability,
	PersistedUnlockCapability,
	PersistedUnlockData,
	SafeStoragePersistedUnlockData,
} from "../types";
import { base64ToBytes, bytesToBase64 } from "../utils/base64";

export interface PersistedUnlockStorageOptions {
	allowInsecureFallback: boolean;
}

export interface PersistedUnlockStorage {
	getCapability(options?: PersistedUnlockStorageOptions): PersistedUnlockCapability;
	protect(
		password: string,
		options?: PersistedUnlockStorageOptions,
	): PersistedUnlockData;
	unprotect(
		data: PersistedUnlockData,
		options?: PersistedUnlockStorageOptions,
	): string;
}

interface SafeStorageLike {
	decryptString: (encrypted: Uint8Array) => string;
	encryptString: (plainText: string) => Uint8Array;
	getSelectedStorageBackend?: () => string;
	isEncryptionAvailable: () => boolean;
}

interface ElectronModuleLike {
	safeStorage?: SafeStorageLike;
}

interface RuntimeModuleLike {
	require?: (moduleName: string) => unknown;
}

interface RuntimeProcessLike {
	mainModule?: RuntimeModuleLike;
	platform?: string;
}

export interface PersistedUnlockRuntimeLike {
	__non_webpack_require__?: (moduleName: string) => unknown;
	electron?: ElectronModuleLike;
	module?: RuntimeModuleLike;
	process?: RuntimeProcessLike;
	require?: (moduleName: string) => unknown;
	window?: {
		__non_webpack_require__?: (moduleName: string) => unknown;
		electron?: ElectronModuleLike;
		module?: RuntimeModuleLike;
		process?: RuntimeProcessLike;
		require?: (moduleName: string) => unknown;
	};
}

type PersistedUnlockBackendSource = Exclude<
	PersistedUnlockCapability["source"],
	"none"
>;

interface PersistedUnlockBackend {
	readonly source: PersistedUnlockBackendSource;
	getAvailability(): PersistedUnlockAvailability;
	canRead(data: PersistedUnlockData): boolean;
	protect(password: string): PersistedUnlockData;
	unprotect(data: PersistedUnlockData): string;
}

type ModuleLoader = (moduleName: string) => unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isModuleLoader(value: unknown): value is ModuleLoader {
	return typeof value === "function";
}

function isSafeStorageLike(value: unknown): value is SafeStorageLike {
	return (
		isRecord(value) &&
		typeof value.decryptString === "function" &&
		typeof value.encryptString === "function" &&
		typeof value.isEncryptionAvailable === "function"
	);
}

function isSafeStoragePersistedUnlockData(
	data: PersistedUnlockData,
): data is Extract<PersistedUnlockData, { protectedPasswordB64: string }> {
	return typeof (data as { protectedPasswordB64?: unknown }).protectedPasswordB64 === "string";
}

function isCompatibilityFallbackPersistedUnlockData(
	data: PersistedUnlockData,
): data is Extract<PersistedUnlockData, { kind: "compatibility-fallback" }> {
	return data.version === PERSISTED_UNLOCK_DATA_VERSION && data.kind === "compatibility-fallback";
}

function createBackendUnavailableError(): Error {
	return new Error("persisted_unlock_backend_unavailable");
}

export function isPersistedUnlockBackendUnavailableError(error: unknown): boolean {
	return error instanceof Error && error.message === "persisted_unlock_backend_unavailable";
}

function getScopedRequire():
	| ((moduleName: string) => unknown)
	| undefined {
	const resolvedRequire = (globalThis as Record<string, unknown>).require;
	return isModuleLoader(resolvedRequire) ? resolvedRequire : undefined;
}

function bindModuleLoader(
	context: object | undefined,
	candidate: unknown,
): ((moduleName: string) => unknown) | undefined {
	if (typeof candidate !== "function") {
		return undefined;
	}

	return context
		? (candidate.bind(context) as (moduleName: string) => unknown)
		: (candidate as (moduleName: string) => unknown);
}

export function resolveRuntimeRequire(
	runtime: PersistedUnlockRuntimeLike = globalThis as PersistedUnlockRuntimeLike,
	scopedRequire: ((moduleName: string) => unknown) | undefined = getScopedRequire(),
):
	| ((moduleName: string) => unknown)
	| undefined {
	const candidates = [
		bindModuleLoader(runtime, runtime.require),
		bindModuleLoader(runtime.window, runtime.window?.require),
		bindModuleLoader(runtime.module, runtime.module?.require),
		bindModuleLoader(runtime.window?.module, runtime.window?.module?.require),
		bindModuleLoader(
			runtime.process?.mainModule,
			runtime.process?.mainModule?.require,
		),
		bindModuleLoader(
			runtime.window?.process?.mainModule,
			runtime.window?.process?.mainModule?.require,
		),
		bindModuleLoader(runtime, runtime.__non_webpack_require__),
		bindModuleLoader(
			runtime.window,
			runtime.window?.__non_webpack_require__,
		),
		scopedRequire,
	];

	for (const candidate of candidates) {
		if (typeof candidate === "function") {
			return candidate;
		}
	}

	return undefined;
}

function resolveSafeStorageFromElectronModule(
	electronModule: unknown,
): SafeStorageLike | null {
	if (!isRecord(electronModule)) {
		return null;
	}

	const safeStorage = (electronModule as ElectronModuleLike).safeStorage;
	return isSafeStorageLike(safeStorage) ? safeStorage : null;
}

export function resolveElectronSafeStorage(
	runtime: PersistedUnlockRuntimeLike = globalThis as PersistedUnlockRuntimeLike,
	scopedRequire: ((moduleName: string) => unknown) | undefined = getScopedRequire(),
): SafeStorageLike | null {
	for (const candidate of [runtime.electron, runtime.window?.electron]) {
		const safeStorage = resolveSafeStorageFromElectronModule(candidate);
		if (safeStorage) {
			return safeStorage;
		}
	}

	const runtimeRequire = resolveRuntimeRequire(runtime, scopedRequire);

	if (!runtimeRequire) {
		return null;
	}

	try {
		return resolveSafeStorageFromElectronModule(runtimeRequire("electron"));
	} catch {
		return null;
	}
}

function getRuntimePlatform(
	runtime: PersistedUnlockRuntimeLike = globalThis as PersistedUnlockRuntimeLike,
): string | null {
	if (typeof runtime.process?.platform === "string") {
		return runtime.process.platform;
	}

	return typeof runtime.window?.process?.platform === "string"
		? runtime.window.process.platform
		: null;
}

export class ElectronPersistedUnlockBackend implements PersistedUnlockBackend {
	readonly source = "safe-storage" as const;

	constructor(
		private readonly safeStorage: SafeStorageLike | null = resolveElectronSafeStorage(),
		private readonly runtimePlatform: string | null = getRuntimePlatform(),
	) {}

	getAvailability(): PersistedUnlockAvailability {
		if (!this.safeStorage || !this.safeStorage.isEncryptionAvailable()) {
			return "unavailable";
		}

		if (this.runtimePlatform === "linux") {
			const backend = this.safeStorage.getSelectedStorageBackend?.();

			if (backend === "basic_text" || typeof backend !== "string") {
				return "insecure";
			}
		}

		return "available";
	}

	canRead(data: PersistedUnlockData): boolean {
		return isSafeStoragePersistedUnlockData(data);
	}

	protect(password: string): SafeStoragePersistedUnlockData {
		if (!this.safeStorage || this.getAvailability() === "unavailable") {
			throw createBackendUnavailableError();
		}

		return {
			kind: "safe-storage",
			version: PERSISTED_UNLOCK_DATA_VERSION,
			protectedPasswordB64: bytesToBase64(
				this.safeStorage.encryptString(password),
			),
		};
	}

	unprotect(data: PersistedUnlockData): string {
		if (
			!this.safeStorage ||
			this.getAvailability() === "unavailable" ||
			!isSafeStoragePersistedUnlockData(data)
		) {
			throw createBackendUnavailableError();
		}

		return this.safeStorage.decryptString(base64ToBytes(data.protectedPasswordB64));
	}
}

class CompatibilityFallbackPersistedUnlockBackend
	implements PersistedUnlockBackend
{
	readonly source = "compatibility-fallback" as const;

	constructor(private readonly isEnabled: boolean) {}

	getAvailability(): PersistedUnlockAvailability {
		return this.isEnabled ? "insecure" : "unavailable";
	}

	canRead(data: PersistedUnlockData): boolean {
		return isCompatibilityFallbackPersistedUnlockData(data);
	}

	protect(password: string): PersistedUnlockData {
		if (!this.isEnabled) {
			throw createBackendUnavailableError();
		}

		return {
			kind: "compatibility-fallback",
			plainPassword: password,
			version: PERSISTED_UNLOCK_DATA_VERSION,
		};
	}

	unprotect(data: PersistedUnlockData): string {
		if (!this.isEnabled || !isCompatibilityFallbackPersistedUnlockData(data)) {
			throw createBackendUnavailableError();
		}

		return data.plainPassword;
	}
}

export class ElectronPersistedUnlockStorage implements PersistedUnlockStorage {
	private readonly safeStorageBackend: ElectronPersistedUnlockBackend;

	constructor(
		safeStorage: SafeStorageLike | null = resolveElectronSafeStorage(),
		runtimePlatform: string | null = getRuntimePlatform(),
	) {
		this.safeStorageBackend = new ElectronPersistedUnlockBackend(
			safeStorage,
			runtimePlatform,
		);
	}

	getCapability(
		options: PersistedUnlockStorageOptions = {
			allowInsecureFallback: false,
		},
	): PersistedUnlockCapability {
		const writerBackend = this.resolveWriterBackend(options);

		if (!writerBackend) {
			return {
				availability: "unavailable",
				source: "none",
			};
		}

		return {
			availability: writerBackend.getAvailability(),
			source: writerBackend.source,
		};
	}

	protect(
		password: string,
		options: PersistedUnlockStorageOptions = {
			allowInsecureFallback: false,
		},
	): PersistedUnlockData {
		const writerBackend = this.resolveWriterBackend(options);

		if (!writerBackend) {
			throw createBackendUnavailableError();
		}

		return writerBackend.protect(password);
	}

	unprotect(
		data: PersistedUnlockData,
		options: PersistedUnlockStorageOptions = {
			allowInsecureFallback: false,
		},
	): string {
		const backends = [
			this.safeStorageBackend,
			this.createCompatibilityBackend(options),
		];
		const matchingBackend = backends.find((backend) => backend.canRead(data));

		if (!matchingBackend) {
			throw createBackendUnavailableError();
		}

		return matchingBackend.unprotect(data);
	}

	private createCompatibilityBackend(
		options: PersistedUnlockStorageOptions,
	): CompatibilityFallbackPersistedUnlockBackend {
		return new CompatibilityFallbackPersistedUnlockBackend(
			options.allowInsecureFallback,
		);
	}

	private resolveWriterBackend(
		options: PersistedUnlockStorageOptions,
	): PersistedUnlockBackend | null {
		if (this.safeStorageBackend.getAvailability() !== "unavailable") {
			return this.safeStorageBackend;
		}

		const compatibilityBackend = this.createCompatibilityBackend(options);
		return compatibilityBackend.getAvailability() === "unavailable"
			? null
			: compatibilityBackend;
	}
}

export function createPersistedUnlockStorage(): PersistedUnlockStorage {
	return new ElectronPersistedUnlockStorage();
}
