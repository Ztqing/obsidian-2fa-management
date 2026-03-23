import { ItemView, WorkspaceLeaf } from "obsidian";
import { OBSIDIAN_2FA_VIEW } from "../../constants";
import type TwoFactorManagementPlugin from "../../plugin";
import { TotpCodeRefreshController } from "./totp-manager-view-code-refresh";
import {
	createTotpManagerViewControllerEnvironment,
	TotpManagerViewController,
} from "./totp-manager-view-controller";
import {
	TotpManagerViewRenderer,
	type TotpManagerViewRendererActions,
	type TotpManagerViewRenderMode,
} from "./totp-manager-view-renderer";
import { TotpManagerViewState } from "./totp-manager-view-state";

export class TotpManagerView extends ItemView {
	private readonly plugin: TwoFactorManagementPlugin;
	private readonly state = new TotpManagerViewState();
	private readonly codeRefresh = new TotpCodeRefreshController();
	private readonly controller: TotpManagerViewController;
	private readonly renderer: TotpManagerViewRenderer;
	private readonly rendererActions: TotpManagerViewRendererActions;

	constructor(leaf: WorkspaceLeaf, plugin: TwoFactorManagementPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.navigation = false;
		this.controller = new TotpManagerViewController(
			createTotpManagerViewControllerEnvironment(this.plugin),
			this.state,
			this.codeRefresh,
			(mode) => this.refresh(mode),
		);
		this.rendererActions = this.controller.createRendererActions();
		this.renderer = new TotpManagerViewRenderer(
			this.plugin,
			this.state,
			this.codeRefresh,
			this.rendererActions,
		);
	}

	getViewType(): string {
		return OBSIDIAN_2FA_VIEW;
	}

	getDisplayText(): string {
		return this.plugin.t("view.title");
	}

	getIcon(): "key-round" {
		return "key-round";
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		this.addAction("lock", this.plugin.t("command.lockVault"), () => {
			this.controller.lockVault();
		});
		this.registerDomEvent(window, "pointerup", (event) => {
			void this.controller.handleGlobalPointerEnd(event);
		});
		this.registerDomEvent(window, "pointercancel", (event) => {
			this.controller.handleGlobalPointerCancel(event);
		});
		this.registerInterval(
			window.setInterval(() => {
				void this.codeRefresh.refreshVisibleCodes(
					this.plugin,
					this.state.getVisibleEntries(),
				);
			}, 1000),
		);
		await this.refresh();
	}

	async onClose(): Promise<void> {
		this.state.resetForUnavailableVault();
		this.codeRefresh.destroy();
		await super.onClose();
	}

	async refresh(mode: TotpManagerViewRenderMode = "full"): Promise<void> {
		const renderResult = this.renderer.render(this.contentEl, {
			entries: this.plugin.getEntries(),
			isUnlocked: this.plugin.isUnlocked(),
			isVaultInitialized: this.plugin.isVaultInitialized(),
			showFloatingLockButton: this.plugin.shouldShowFloatingLockButton(),
			showUpcomingCodes: this.plugin.shouldShowUpcomingCodes(),
		}, mode);
		if (!renderResult.shouldRefreshVisibleCodes) {
			return;
		}

		await this.codeRefresh.refreshVisibleCodes(this.plugin, this.state.getVisibleEntries());
	}
}
