import { ItemView, Notice, Setting, WorkspaceLeaf } from "obsidian";
import { OBSIDIAN_2FA_VIEW } from "../../constants";
import { filterTotpEntries } from "../../data/store";
import { createTotpSnapshot } from "../../totp/totp";
import { copyTextToClipboard } from "../../utils/clipboard";
import type { TotpEntryRecord } from "../../types";
import type TwoFactorManagementPlugin from "../../plugin";

interface EntryRowRefs {
	codeEl: HTMLElement;
	countdownEl: HTMLElement;
}

export class TotpManagerView extends ItemView {
	private readonly plugin: TwoFactorManagementPlugin;
	private searchQuery = "";
	private visibleEntries: TotpEntryRecord[] = [];
	private rowRefs = new Map<string, EntryRowRefs>();
	private refreshRun = 0;

	constructor(leaf: WorkspaceLeaf, plugin: TwoFactorManagementPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.navigation = false;
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
		this.addAction("plus", this.plugin.t("command.addEntry"), () => {
			void this.plugin.handleAddEntryCommand();
		});
		this.addAction("import", this.plugin.t("command.bulkImportOtpauthLinks"), () => {
			void this.plugin.handleBulkImportOtpauthLinksCommand();
		});
		this.addAction("lock", this.plugin.t("command.lockVault"), () => {
			this.plugin.lockVault(true);
		});
		this.registerInterval(
			window.setInterval(() => {
				void this.refreshVisibleCodes();
			}, 1000),
		);
		await this.refresh();
	}

	async refresh(): Promise<void> {
		this.render();
		await this.refreshVisibleCodes();
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("twofa-view");
		this.rowRefs.clear();
		this.visibleEntries = [];

		if (!this.plugin.isVaultInitialized()) {
			this.renderUninitializedState();
			return;
		}

		if (!this.plugin.isUnlocked()) {
			this.renderLockedState();
			return;
		}

		this.renderUnlockedState();
	}

	private renderUninitializedState(): void {
		const wrapper = this.contentEl.createDiv({
			cls: "twofa-empty-state",
		});
		wrapper.createEl("h3", {
			text: this.plugin.t("view.uninitialized.title"),
		});
		wrapper.createEl("p", {
			text: this.plugin.t("view.uninitialized.description"),
		});
		const actions = wrapper.createDiv({
			cls: "twofa-inline-actions",
		});
		const initializeButton = actions.createEl("button", {
			text: this.plugin.t("common.createVault"),
		});
		initializeButton.addClass("mod-cta");
		initializeButton.addEventListener("click", () => {
			void this.plugin.promptToInitializeVault();
		});
	}

	private renderLockedState(): void {
		const wrapper = this.contentEl.createDiv({
			cls: "twofa-empty-state",
		});
		wrapper.createEl("h3", {
			text: this.plugin.t("view.locked.title"),
		});
		wrapper.createEl("p", {
			text: this.plugin.t("view.locked.description"),
		});
		const actions = wrapper.createDiv({
			cls: "twofa-inline-actions",
		});
		const unlockButton = actions.createEl("button", {
			text: this.plugin.t("common.unlockVault"),
		});
		unlockButton.addClass("mod-cta");
		unlockButton.addEventListener("click", () => {
			void this.plugin.promptToUnlockVault();
		});
	}

	private renderUnlockedState(): void {
		const toolbar = this.contentEl.createDiv({
			cls: "twofa-toolbar",
		});
		const searchInput = toolbar.createEl("input", {
			type: "search",
			placeholder: this.plugin.t("view.search.placeholder"),
		});
		searchInput.addClass("twofa-search-input");
		searchInput.value = this.searchQuery;
		searchInput.addEventListener("input", (event) => {
			this.searchQuery = (event.target as HTMLInputElement).value;
			void this.refresh();
		});

		const actionGroup = toolbar.createDiv({
			cls: "twofa-inline-actions",
		});
		const addButton = actionGroup.createEl("button", {
			text: this.plugin.t("common.addEntry"),
		});
		addButton.addClass("mod-cta");
		addButton.addEventListener("click", () => {
			void this.plugin.handleAddEntryCommand();
		});

		const importButton = actionGroup.createEl("button", {
			text: this.plugin.t("common.bulkImport"),
		});
		importButton.addEventListener("click", () => {
			void this.plugin.handleBulkImportOtpauthLinksCommand();
		});

		const lockButton = actionGroup.createEl("button", {
			text: this.plugin.t("common.lock"),
		});
		lockButton.addEventListener("click", () => {
			this.plugin.lockVault(true);
		});

		this.visibleEntries = filterTotpEntries(this.plugin.getEntries(), this.searchQuery);

		const summary = new Setting(this.contentEl)
			.setName(
				this.visibleEntries.length === 1
					? this.plugin.t("view.summary.one", {
						count: this.visibleEntries.length,
					})
					: this.plugin.t("view.summary.other", {
						count: this.visibleEntries.length,
					}),
			)
			.setDesc(this.plugin.t("view.summary.description"));
		summary.settingEl.addClass("twofa-summary-row");

		if (this.visibleEntries.length === 0) {
			const emptyState = this.contentEl.createDiv({
				cls: "twofa-empty-state twofa-empty-state--compact",
			});
			emptyState.createEl("p", {
				text:
					this.searchQuery.trim().length > 0
						? this.plugin.t("view.empty.search")
						: this.plugin.t("view.empty.entries"),
			});
			return;
		}

		const list = this.contentEl.createDiv({
			cls: "twofa-entry-list",
		});

		for (const entry of this.visibleEntries) {
			const card = list.createDiv({
				cls: "twofa-entry-card",
			});
			const header = card.createDiv({
				cls: "twofa-entry-card__header",
			});
			const titleBlock = header.createDiv({
				cls: "twofa-entry-card__title-block",
			});
			titleBlock.createEl("div", {
				cls: "twofa-entry-card__title",
				text: entry.issuer || entry.accountName,
			});
			if (entry.issuer) {
				titleBlock.createEl("div", {
					cls: "twofa-entry-card__subtitle",
					text: entry.accountName,
				});
			}

			const badge = header.createDiv({
				cls: "twofa-entry-card__badge",
			});
			badge.setText(
				this.plugin.t("view.entry.badge", {
					digits: entry.digits,
					period: entry.period,
				}),
			);

			const codeRow = card.createDiv({
				cls: "twofa-entry-card__code-row",
			});
			const codeEl = codeRow.createEl("code", {
				cls: "twofa-entry-card__code",
				text: "------",
			});
			const countdownEl = codeRow.createDiv({
				cls: "twofa-entry-card__countdown",
				text: "...",
			});
			this.rowRefs.set(entry.id, {
				codeEl,
				countdownEl,
			});

			const actions = card.createDiv({
				cls: "twofa-inline-actions twofa-entry-card__actions",
			});
			const copyButton = actions.createEl("button", {
				text: this.plugin.t("common.copyCode"),
			});
			copyButton.addClass("mod-cta");
			copyButton.addEventListener("click", () => {
				void this.copyEntryCode(entry);
			});

			const editButton = actions.createEl("button", {
				text: this.plugin.t("common.edit"),
			});
			editButton.addEventListener("click", () => {
				void this.plugin.promptToEditEntry(entry);
			});

			const deleteButton = actions.createEl("button", {
				text: this.plugin.t("common.delete"),
			});
			deleteButton.addClass("mod-warning");
			deleteButton.addEventListener("click", () => {
				void this.plugin.confirmAndDeleteEntry(entry);
			});
		}
	}

	private async copyEntryCode(entry: TotpEntryRecord): Promise<void> {
		try {
			const snapshot = await createTotpSnapshot(entry);
			await copyTextToClipboard(snapshot.code);
			new Notice(
				this.plugin.t("notice.codeCopied", {
					accountName: entry.accountName,
				}),
			);
		} catch (error) {
			new Notice(this.plugin.getErrorMessage(error));
		}
	}

	private async refreshVisibleCodes(): Promise<void> {
		if (!this.plugin.isUnlocked() || this.visibleEntries.length === 0) {
			return;
		}

		const currentRun = this.refreshRun + 1;
		this.refreshRun = currentRun;
		const snapshots = await Promise.all(
			this.visibleEntries.map(async (entry) => {
				try {
					return {
						entryId: entry.id,
						snapshot: await createTotpSnapshot(entry),
						error: null,
					};
				} catch (error) {
					return {
						entryId: entry.id,
						snapshot: null,
						error: this.plugin.getErrorMessage(error),
					};
				}
			}),
		);

		if (currentRun !== this.refreshRun) {
			return;
		}

		for (const result of snapshots) {
			const refs = this.rowRefs.get(result.entryId);
			if (!refs) {
				continue;
			}

			if (result.snapshot) {
				refs.codeEl.setText(result.snapshot.code);
				refs.countdownEl.setText(
					this.plugin.t("view.entry.countdown", {
						seconds: result.snapshot.secondsRemaining,
					}),
				);
				refs.codeEl.removeClass("is-error");
				continue;
			}

			refs.codeEl.setText(this.plugin.t("view.entry.error"));
			refs.codeEl.addClass("is-error");
			refs.countdownEl.setText(result.error ?? this.plugin.t("view.entry.refreshFallback"));
		}
	}
}
