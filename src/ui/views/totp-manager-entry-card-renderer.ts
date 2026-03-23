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
		const card = listEl.createDiv({
			cls: "twofa-entry-card",
		});
		card.toggleClass("is-selected", isSelected);
		card.toggleClass("is-selection-mode", this.state.isSelectionMode());
		card.draggable = this.state.isSelectionMode();
		card.tabIndex = 0;
		card.setAttribute("role", this.state.isSelectionMode() ? "checkbox" : "button");
		if (this.state.isSelectionMode()) {
			card.setAttribute("aria-checked", String(isSelected));
		}
		card.setAttribute(
			"aria-label",
			this.plugin.t("view.entry.cardAriaLabel", {
				accountName: entry.accountName,
			}),
		);
		card.addEventListener("pointerdown", (event) => {
			this.actions.onCardPointerDown(entry, event);
		});
		card.addEventListener("pointermove", (event) => {
			this.actions.onCardPointerMove(event);
		});
		card.addEventListener("pointerup", () => {
			this.actions.onCardPointerEnd();
		});
		card.addEventListener("pointerleave", () => {
			this.actions.onCardPointerEnd();
		});
		card.addEventListener("pointercancel", () => {
			this.actions.onCardPointerEnd();
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
		card.addEventListener("dragstart", (event) => {
			this.actions.onCardDragStart(entry, event);
		});
		card.addEventListener("dragover", (event) => {
			this.actions.onCardDragOver(entry, card, event);
		});
		card.addEventListener("drop", (event) => {
			this.actions.onCardDrop(entry, card, event);
		});
		card.addEventListener("dragend", () => {
			this.actions.onCardDragEnd();
		});

		if (this.state.isSelectionMode()) {
			const selectionControls = card.createDiv({
				cls: "twofa-entry-card__selection-controls",
			});
			const manageIndicator = selectionControls.createDiv({
				cls: "twofa-entry-card__selection-indicator",
			});
			manageIndicator.setText(isSelected ? "✓" : "");
			selectionControls.createDiv({
				cls: "twofa-entry-card__drag-handle",
				text: "⋮⋮",
			});
		}

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
		const titleRow = titleBlock.createDiv({
			cls: "twofa-entry-card__title-row",
		});
		titleRow.createEl("div", {
			cls: "twofa-entry-card__title",
			text: entry.issuer || entry.accountName,
		});
		if (entry.issuer) {
			titleBlock.createEl("div", {
				cls: "twofa-entry-card__subtitle",
				text: entry.accountName,
			});
		}

		const codeRow = card.createDiv({
			cls: "twofa-entry-card__code-row",
		});
		const codeGroup = codeRow.createDiv({
			cls: "twofa-entry-card__code-group",
		});
		const codeEl = codeGroup.createEl("code", {
			cls: "twofa-entry-card__code",
		});
		renderStaticCode(codeEl, CODE_PLACEHOLDER);
		let nextCodeEl: HTMLElement | null = null;
		if (showUpcomingCodes) {
			nextCodeEl = codeGroup.createEl("code", {
				cls: "twofa-entry-card__next-code-pill",
			});
			renderStaticCode(nextCodeEl, CODE_PLACEHOLDER);
		}
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
