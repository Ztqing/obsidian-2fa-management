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

function clearAttribute(element: HTMLElement, name: string): void {
	if (typeof element.removeAttribute === "function") {
		element.removeAttribute(name);
		return;
	}

	const attributes = (element as unknown as { attributes?: Map<string, string> }).attributes;
	attributes?.delete(name);
}

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
	): HTMLElement {
		const card = listEl.createDiv({
			cls: "twofa-entry-card",
		});
		card.tabIndex = 0;
		this.syncCardSelectionState(card, entry.id);

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
			this.actions.onCardClick(entry, card, event);
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
		const providerIconId = this.resolveProviderIcon(entry);
		providerIcon.setAttribute("data-provider-icon", providerIconId);
		card.setAttribute("data-provider-icon", providerIconId);
		this.setProviderIcon(providerIcon, providerIconId);

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

		const statusRail = header.createDiv({
			cls: "twofa-entry-card__status-rail",
		});
		const countdownBadgeEl = statusRail.createDiv({
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
		const codeCluster = codeRow.createDiv({
			cls: "twofa-entry-card__code-cluster",
		});
		const codePrimary = codeCluster.createDiv({
			cls: "twofa-entry-card__code-primary",
		});
		const codeEl = codePrimary.createEl("code", {
			cls: "twofa-entry-card__code",
		});
		renderStaticCode(codeEl, CODE_PLACEHOLDER);

		let nextCodeEl: HTMLElement | null = null;
		let nextCodeRowEl: HTMLElement | null = null;
		if (showUpcomingCodes) {
			nextCodeRowEl = codeCluster.createDiv({
				cls: "twofa-entry-card__next-code-row is-visible",
			});
			nextCodeRowEl.setAttribute("aria-label", this.plugin.t("view.entry.nextCode"));
			nextCodeEl = nextCodeRowEl.createEl("code", {
				cls: "twofa-entry-card__next-code",
			});
			renderStaticCode(nextCodeEl, CODE_PLACEHOLDER);
		}

		const refs: EntryRowRefs = {
			activeTransitionEl: null,
			cardEl: card,
			codeAnimationTimeoutId: null,
			codeAnimationToken: 0,
			codeEl,
			countdownBadgeEl,
			countdownEl,
			nextCodeEl,
			nextCodeRowEl,
			previousCurrentCode: null,
		};
		this.codeRefresh.registerRow(entry, refs);
		return card;
	}

	syncCardSelectionState(card: HTMLElement, entryId: string): void {
		const isSelected = this.state.isEntrySelected(entryId);
		const isSelectionMode = this.state.isSelectionMode();

		card.toggleClass("is-selected", isSelected);
		card.toggleClass("is-selection-mode", isSelectionMode);
		card.setAttribute("role", isSelectionMode ? "checkbox" : "button");
		if (isSelectionMode) {
			card.setAttribute("aria-checked", String(isSelected));
			return;
		}

		clearAttribute(card, "aria-checked");
	}
}
