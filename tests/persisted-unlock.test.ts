import assert from "node:assert/strict";
import test from "node:test";
import {
	ElectronPersistedUnlockStorage,
	resolveElectronSafeStorage,
	resolveRuntimeRequire,
} from "../src/security/persisted-unlock";
import type { PersistedUnlockRuntimeLike } from "../src/security/persisted-unlock";

function createSafeStorage(options: {
	backend?: string;
	encryptionAvailable?: boolean;
} = {}) {
	return {
		decryptString: () => "vault-password",
		encryptString: () => Uint8Array.from([1, 2, 3]),
		getSelectedStorageBackend: () => options.backend ?? "keyring",
		isEncryptionAvailable: () => options.encryptionAvailable ?? true,
	};
}

type RuntimeFactory = (safeStorage: ReturnType<typeof createSafeStorage>) => {
	runtime: PersistedUnlockRuntimeLike;
};

const requireRuntimeFactories: Record<string, RuntimeFactory> = {
	"runtime.require": (safeStorage) => ({
		runtime: {
			safeStorage,
			require(this: { safeStorage: typeof safeStorage }, moduleName: string) {
				assert.equal(moduleName, "electron");
				return { safeStorage: this.safeStorage };
			},
		},
	}),
	"window.require": (safeStorage) => ({
		runtime: {
			window: {
				safeStorage,
				require(this: { safeStorage: typeof safeStorage }, moduleName: string) {
					assert.equal(moduleName, "electron");
					return { safeStorage: this.safeStorage };
				},
			},
		},
	}),
	"module.require": (safeStorage) => ({
		runtime: {
			module: {
				safeStorage,
				require(this: { safeStorage: typeof safeStorage }, moduleName: string) {
					assert.equal(moduleName, "electron");
					return { safeStorage: this.safeStorage };
				},
			},
		},
	}),
	"window.module.require": (safeStorage) => ({
		runtime: {
			window: {
				module: {
					safeStorage,
					require(this: { safeStorage: typeof safeStorage }, moduleName: string) {
						assert.equal(moduleName, "electron");
						return { safeStorage: this.safeStorage };
					},
				},
			},
		},
	}),
	"process.mainModule.require": (safeStorage) => ({
		runtime: {
			process: {
				mainModule: {
					safeStorage,
					require(this: { safeStorage: typeof safeStorage }, moduleName: string) {
						assert.equal(moduleName, "electron");
						return { safeStorage: this.safeStorage };
					},
				},
			},
		},
	}),
	"window.process.mainModule.require": (safeStorage) => ({
		runtime: {
			window: {
				process: {
					mainModule: {
						safeStorage,
						require(
							this: { safeStorage: typeof safeStorage },
							moduleName: string,
						) {
							assert.equal(moduleName, "electron");
							return { safeStorage: this.safeStorage };
						},
					},
				},
			},
		},
	}),
	"__non_webpack_require__": (safeStorage) => ({
		runtime: {
			safeStorage,
			__non_webpack_require__(
				this: { safeStorage: typeof safeStorage },
				moduleName: string,
			) {
				assert.equal(moduleName, "electron");
				return { safeStorage: this.safeStorage };
			},
		},
	}),
	"window.__non_webpack_require__": (safeStorage) => ({
		runtime: {
			window: {
				safeStorage,
				__non_webpack_require__(
					this: { safeStorage: typeof safeStorage },
					moduleName: string,
				) {
					assert.equal(moduleName, "electron");
					return { safeStorage: this.safeStorage };
				},
			},
		},
	}),
};

test("resolveRuntimeRequire supports the Electron loader access paths used by Obsidian", () => {
	for (const [label, createRuntime] of Object.entries(requireRuntimeFactories)) {
		const safeStorage = createSafeStorage();
		const { runtime } = createRuntime(safeStorage);

		const runtimeRequire = resolveRuntimeRequire(runtime, undefined);

		assert.ok(runtimeRequire, `${label} should resolve a module loader`);
		assert.equal(
			resolveElectronSafeStorage(runtime, undefined),
			safeStorage,
			`${label} should resolve electron.safeStorage`,
		);
		assert.equal(
			(runtimeRequire as (moduleName: string) => { safeStorage: typeof safeStorage })(
				"electron",
			).safeStorage,
			safeStorage,
			`${label} should stay bound to its owning runtime object`,
		);
	}
});

test("resolveRuntimeRequire falls back to the scoped require when runtime-specific loaders are missing", () => {
	const safeStorage = createSafeStorage();
	const scopedRequire = (moduleName: string) => {
		assert.equal(moduleName, "electron");
		return { safeStorage };
	};

	const runtimeRequire = resolveRuntimeRequire({}, scopedRequire);

	assert.ok(runtimeRequire);
	assert.equal(resolveElectronSafeStorage({}, scopedRequire), safeStorage);
	assert.equal(
		(runtimeRequire as (moduleName: string) => { safeStorage: typeof safeStorage })(
			"electron",
		).safeStorage,
		safeStorage,
	);
});

test("resolveElectronSafeStorage accepts direct Electron injection on runtime objects", () => {
	const runtimeSafeStorage = createSafeStorage();
	const windowSafeStorage = createSafeStorage();

	assert.equal(
		resolveElectronSafeStorage({
			electron: {
				safeStorage: runtimeSafeStorage,
			},
		}),
		runtimeSafeStorage,
	);
	assert.equal(
		resolveElectronSafeStorage({
			window: {
				electron: {
					safeStorage: windowSafeStorage,
				},
			},
		}),
		windowSafeStorage,
	);
});

test("ElectronPersistedUnlockStorage reports available, insecure, and unavailable availability states", () => {
	assert.deepEqual(
		new ElectronPersistedUnlockStorage(createSafeStorage(), "darwin").getCapability(),
		{
			availability: "available",
			source: "safe-storage",
		},
	);
	assert.deepEqual(
		new ElectronPersistedUnlockStorage(
			createSafeStorage({
				backend: "basic_text",
			}),
			"linux",
		).getCapability(),
		{
			availability: "insecure",
			source: "safe-storage",
		},
	);
	assert.deepEqual(
		new ElectronPersistedUnlockStorage(
			createSafeStorage({
				encryptionAvailable: false,
			}),
			"darwin",
		).getCapability(),
		{
			availability: "unavailable",
			source: "none",
		},
	);
	assert.deepEqual(
		new ElectronPersistedUnlockStorage(null, "darwin").getCapability(),
		{
			availability: "unavailable",
			source: "none",
		},
	);
});

test("ElectronPersistedUnlockStorage enables the explicit compatibility fallback only when requested", () => {
	const storage = new ElectronPersistedUnlockStorage(null, "darwin");

	assert.deepEqual(storage.getCapability(), {
		availability: "unavailable",
		source: "none",
	});
	assert.deepEqual(
		storage.getCapability({
			allowInsecureFallback: true,
		}),
		{
			availability: "insecure",
			source: "compatibility-fallback",
		},
	);

	const fallbackData = storage.protect("vault-password", {
		allowInsecureFallback: true,
	});

	assert.deepEqual(fallbackData, {
		kind: "compatibility-fallback",
		plainPassword: "vault-password",
		version: 2,
	});
	assert.equal(
		storage.unprotect(fallbackData, {
			allowInsecureFallback: true,
		}),
		"vault-password",
	);
});
