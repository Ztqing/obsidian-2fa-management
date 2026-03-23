import { setIcon } from "obsidian";
import type TwoFactorManagementPlugin from "../../plugin";
import type { TotpEntryRecord } from "../../types";
import { resolveProviderIcon } from "../provider-icons";
import {
	type EntryRowRefs,
	type TotpCodeRefreshController,
	renderStaticCode,
} from "./totp-manager-view-code-refresh";
import type { TotpManagerViewRendererActions } from "./totp-manager-view-renderer";
import type { TotpManagerViewState } from "./totp-manager-view-state";

const CODE_PLACEHOLDER = "------";

export interface TotpManagerEntryCardRendererDependencies {
	resolveProviderIcon?: (entry: TotpEntryRecord) => string;
	setProviderIcon?: (element: HTMLElement, icon: string) => void;
}

export class TotpManagerEntryCardRenderer {
	private readonly resolveProviderIcon: (entry: TotpEntryRecord) => string;
	private readonly setProviderIcon: (element: HTMLElement, icon: string) => void;

	constructor(
		private readonly plugin: Pick<TwoFactorManagementPlugin, "t">,
		private readonly state: TotpManagerViewState,
		private readonly codeRefresh: Pick<TotpCodeRefreshController, "registerRow">,
		private readonly actions: TotpManagerViewRendererActions,
		dependencies: TotpManagerEntryCardRendererDependencies = {},
	) {
		this.resolveProviderIcon =
			dependencies.resolveProviderIcon ?? resolveProviderIcon;
		this.setProviderIcon = dependencies.setProviderIcon ?? setIcon;
	}

	renderEntryCard(
		listEl: HTMLElement,
		entry: TotpEntryRecord,
		showUpcomingCodes: boolean,
	): void {
		const isSelected = this.state.isEntrySelected(entry.id);
		const isSelectionMode = this.state.isSelectionMode();
		const card = listEl.createDiv({
			cls: "twofa-entry-card",
		});
		card.toggleClass("is-selected", isSelected);
		card.toggleClass("is-selection-mode", isSelectionMode);
		card.tabIndex = 0;
		card.setAttribute("role", isSelectionMode ? "checkbox" : "button");
		if (isSelectionMode) {
			card.setAttribute("aria-checked", String(isSelected));
		}

		card.addEventListener("pointerdown", (event) => {
			this.actions.onCardPointerDown(entry, event);
		});
		card.addEventListener("pointermove", (event) => {
			this.actions.onCardPointerMove(entry, card, event);
		});
		card.addEventListener("pointerup", (event) => {
			this.actions.onCardPointerEnd(entry, card, event);
		});
		card.addEventListener("pointerleave", (event) => {
			this.actions.onCardPointerLeave(event);
		});
		card.addEventListener("pointercancel", (event) => {
			this.actions.onCardPointerCancel(event);
		});
		card.addEventListener("click", (event) => {
			this.actions.onCardClick(entry, event);
		});
		card.addEventListener("contextmenu", (event) => {
			this.actions.onCardContextMenu(entry, event);
		});
		card.addEventListener("keydown", (event) => {
			this.actions.onCardKeyDown(entry, card, event);
		});

		const header = card.createDiv({
			cls: "twofa-entry-card__header",
		});
		const identity = header.createDiv({
			cls: "twofa-entry-card__identity",
		});
		const providerIcon = identity.createDiv({
			cls: "twofa-entry-card__provider-icon",
		});
		providerIcon.setAttribute("aria-hidden", "true");
		this.setProviderIcon(providerIcon, this.resolveProviderIcon(entry));

		const titleBlock = identity.createDiv({
			cls: "twofa-entry-card__title-block",
		});
		const titleId = `twofa-entry-title-${entry.id}`;
		const titleEl = titleBlock.createEl("div", {
			cls: "twofa-entry-card__title",
			text: entry.issuer || entry.accountName,
		});
		titleEl.setAttribute("id", titleId);
		const labelledByIds = [titleId];

		if (entry.issuer) {
			const subtitleId = `twofa-entry-subtitle-${entry.id}`;
			const subtitleEl = titleBlock.createEl("div", {
				cls: "twofa-entry-card__subtitle",
				text: entry.accountName,
			});
			subtitleEl.setAttribute("id", subtitleId);
			labelledByIds.push(subtitleId);
		}

		card.setAttribute("aria-labelledby", labelledByIds.join(" "));

		const codeSection = card.createDiv({
			cls: "twofa-entry-card__code-section",
		});
		const codeRow = codeSection.createDiv({
			cls: "twofa-entry-card__code-row",
		});
		const codeEl = codeRow.createEl("code", {
			cls: "twofa-entry-card__code",
		});
		renderStaticCode(codeEl, CODE_PLACEHOLDER);

		const countdownBadgeEl = codeRow.createDiv({
			cls: "twofa-entry-card__countdown-badge",
		});
		countdownBadgeEl.setAttribute(
			"aria-label",
			this.plugin.t("view.entry.countdown", {
				seconds: 0,
			}),
		);
		const countdownEl = countdownBadgeEl.createDiv({
			cls: "twofa-entry-card__countdown",
			text: "...",
		});

		let nextCodeEl: HTMLElement | null = null;
		if (showUpcomingCodes) {
			const supportRow = card.createDiv({
				cls: "twofa-entry-card__supporting-row",
			});
			supportRow.createDiv({
				cls: "twofa-entry-card__supporting-label",
				text: this.plugin.t("view.entry.nextCode"),
			});
			nextCodeEl = supportRow.createEl("code", {
				cls: "twofa-entry-card__next-code",
			});
			renderStaticCode(nextCodeEl, CODE_PLACEHOLDER);
		}

		const refs: EntryRowRefs = {
			cardEl: card,
			codeAnimationTimeoutId: null,
			codeAnimationToken: 0,
			codeEl,
			countdownBadgeEl,
			countdownEl,
			nextCodeEl,
			previousCurrentCode: null,
		};
		this.codeRefresh.registerRow(entry.id, refs);
	}
}
