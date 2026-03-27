import assert from "node:assert/strict";
import test from "node:test";
import { FakeElement } from "./support/fake-dom";
import { importWithObsidianRuntime } from "./support/import-with-obsidian-runtime";
import {
	WorkspaceLeaf,
	resetObsidianRuntime,
} from "./support/obsidian-runtime";

test("TotpManagerView wires lifecycle events, lock action, and visible code refresh on open", async () => {
	resetObsidianRuntime();
	const { TotpManagerView } = await importWithObsidianRuntime<{
		TotpManagerView: new (
			leaf: WorkspaceLeaf,
			plugin: Record<string, unknown>,
		) => {
			actions: Array<{
				callback: () => void;
				icon: string;
				title: string;
			}>;
			domEvents: Array<{
				eventName: string;
				target: unknown;
			}>;
			intervals: number[];
			onOpen(): Promise<void>;
			onClose(): Promise<void>;
		};
	}>("./src/ui/views/totp-manager-view.ts");
	const entries = [
		{
			accountName: "name@example.com",
			algorithm: "SHA-1" as const,
			digits: 6,
			id: "entry-1",
			issuer: "GitHub",
			period: 30,
			secret: "JBSWY3DPEHPK3PXP",
			sortOrder: 0,
		},
	];
	const pluginCalls: string[] = [];
	const refreshVisibleCodesCalls: Array<{
		entries: typeof entries;
		showUpcomingCodes: boolean;
	}> = [];

	const previousWindow = globalThis.window;
	const windowEvents: Array<{
		eventName: string;
		target: unknown;
	}> = [];
	const testWindow = {
		clearInterval: (() => undefined) as unknown as typeof globalThis.clearInterval,
		setInterval: (() =>
			42 as unknown as ReturnType<typeof globalThis.setInterval>) as unknown as typeof globalThis.setInterval,
	} as unknown as Window & typeof globalThis;
	(globalThis as typeof globalThis & {
		window: Window & typeof globalThis;
	}).window = testWindow;

	try {
		const view = new TotpManagerView(new WorkspaceLeaf(), {
			getEntries: () => entries,
			getErrorMessage: () => "translated-error",
			getVaultLoadIssue: () => null,
			isUnlocked: () => true,
			isVaultInitialized: () => true,
			lockVault: (showNotice = false) => {
				pluginCalls.push(`lockVault:${showNotice}`);
			},
			recordSessionActivity: () => {
				pluginCalls.push("recordSessionActivity");
			},
			reorderEntriesByIds: async () => {},
			shouldShowUpcomingCodes: () => true,
			t: (key: string) => key,
		} as never);

		(view as never as {
			state: {
				getVisibleEntries(): typeof entries;
				resetForUnavailableVault(): void;
			};
			renderer: {
				render: () => {
					shouldRefreshVisibleCodes: boolean;
				};
			};
			codeRefresh: {
				destroy(): void;
				refreshVisibleCodes(
					plugin: unknown,
					visibleEntries: typeof entries,
					options: {
						showUpcomingCodes: boolean;
					},
				): Promise<void>;
			};
		}).state = {
			getVisibleEntries: () => entries,
			resetForUnavailableVault: () => {
				pluginCalls.push("resetForUnavailableVault");
			},
		};
		(view as never as {
			renderer: {
				render: () => {
					shouldRefreshVisibleCodes: boolean;
				};
			};
		}).renderer = {
			render: () => ({
				shouldRefreshVisibleCodes: true,
			}),
		};
		(view as never as {
			codeRefresh: {
				destroy(): void;
				refreshVisibleCodes(
					plugin: unknown,
					visibleEntries: typeof entries,
					options: {
						showUpcomingCodes: boolean;
					},
				): Promise<void>;
			};
		}).codeRefresh = {
			destroy: () => {
				pluginCalls.push("codeRefresh.destroy");
			},
			refreshVisibleCodes: async (_plugin, visibleEntries, options) => {
				refreshVisibleCodesCalls.push({
					entries: visibleEntries,
					showUpcomingCodes: options.showUpcomingCodes,
				});
			},
		};
		(view as never as {
			controller: {
				destroy(): void;
				handleGlobalPointerCancel(event: PointerEvent): void;
				handleGlobalPointerEnd(event: PointerEvent): Promise<void>;
				lockVault(): void;
			};
		}).controller = {
			destroy: () => {
				pluginCalls.push("controller.destroy");
			},
			handleGlobalPointerCancel: () => {
				windowEvents.push({
					eventName: "pointercancel",
					target: globalThis.window,
				});
			},
			handleGlobalPointerEnd: async () => {
				windowEvents.push({
					eventName: "pointerup",
					target: globalThis.window,
				});
			},
			lockVault: () => {
				pluginCalls.push("controller.lockVault");
			},
		};

		await view.onOpen();

		assert.deepEqual(
			view.actions.map((action) => [action.icon, action.title]),
			[["lock", "command.lockVault"]],
		);
		view.actions[0]?.callback();
		assert.ok(pluginCalls.includes("controller.lockVault"));
		assert.deepEqual(
			view.domEvents.map((event) => event.eventName),
			["change", "input", "keydown", "pointerdown", "pointerup", "pointercancel"],
		);
		assert.deepEqual(view.intervals, [42]);
		assert.deepEqual(refreshVisibleCodesCalls, [
			{
				entries,
				showUpcomingCodes: true,
			},
		]);

		await view.onClose();
		assert.ok(pluginCalls.includes("resetForUnavailableVault"));
		assert.ok(pluginCalls.includes("controller.destroy"));
		assert.ok(pluginCalls.includes("codeRefresh.destroy"));
	} finally {
		(globalThis as typeof globalThis & { window?: unknown }).window =
			previousWindow;
	}
});

test("TotpManagerView skips visible-code refresh when the renderer does not request it", async () => {
	resetObsidianRuntime();
	const { TotpManagerView } = await importWithObsidianRuntime<{
		TotpManagerView: new (
			leaf: WorkspaceLeaf,
			plugin: Record<string, unknown>,
		) => {
			refresh(mode?: string): Promise<void>;
		};
	}>("./src/ui/views/totp-manager-view.ts");
	const refreshVisibleCodesCalls: string[] = [];
	const previousWindow = globalThis.window;
	const testWindow = {
		clearInterval: (() => undefined) as unknown as typeof globalThis.clearInterval,
		setInterval: (() =>
			1 as unknown as ReturnType<typeof globalThis.setInterval>) as unknown as typeof globalThis.setInterval,
	} as unknown as Window & typeof globalThis;
	(globalThis as typeof globalThis & {
		window: Window & typeof globalThis;
	}).window = testWindow;

	try {
		const view = new TotpManagerView(new WorkspaceLeaf(), {
			getEntries: () => [],
			getVaultLoadIssue: () => null,
			isUnlocked: () => true,
			isVaultInitialized: () => true,
			shouldShowUpcomingCodes: () => false,
			t: (key: string) => key,
		} as never);

		(view as never as {
			contentEl: FakeElement;
			renderer: {
				render: () => {
					shouldRefreshVisibleCodes: boolean;
				};
			};
			state: {
				getVisibleEntries(): [];
			};
			codeRefresh: {
				refreshVisibleCodes(): Promise<void>;
			};
		}).contentEl = new FakeElement("div");
		(view as never as {
			renderer: {
				render: () => {
					shouldRefreshVisibleCodes: boolean;
				};
			};
		}).renderer = {
			render: () => ({
				shouldRefreshVisibleCodes: false,
			}),
		};
		(view as never as {
			state: {
				getVisibleEntries(): [];
			};
		}).state = {
			getVisibleEntries: () => [],
		};
		(view as never as {
			codeRefresh: {
				refreshVisibleCodes(): Promise<void>;
			};
		}).codeRefresh = {
			refreshVisibleCodes: async () => {
				refreshVisibleCodesCalls.push("refreshVisibleCodes");
			},
		};

		await view.refresh();

		assert.deepEqual(refreshVisibleCodesCalls, []);
	} finally {
		(globalThis as typeof globalThis & { window?: unknown }).window =
			previousWindow;
	}
});
