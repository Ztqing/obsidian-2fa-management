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

function syncTextContent(element: HTMLElement, value: string): void {
	const fakeElement = element as HTMLElement & {
		textContent?: string;
		setText?: (text: string) => void;
	};
	if (fakeElement.textContent === value) {
		return;
	}

	if (typeof fakeElement.setText === "function") {
		fakeElement.setText(value);
		return;
	}

	element.textContent = value;
}

function appendChildElement(parentEl: HTMLElement, childEl: HTMLElement): void {
	const nextParent = parentEl as HTMLElement & {
		appendChild?: (child: HTMLElement) => void;
	};
	if (typeof nextParent.appendChild === "function") {
		nextParent.appendChild(childEl);
		return;
	}

	parentEl.append(childEl);
}

function createDivElement(parentEl: HTMLElement, className: string): HTMLElement {
	const fakeParent = parentEl as HTMLElement & {
		createEl?: (
			tagName: string,
			options?: {
				cls?: string;
			},
		) => HTMLElement;
	};
	if (typeof fakeParent.createEl === "function") {
		return fakeParent.createEl("div", {
			cls: className,
		});
	}

	const element = document.createElement("div");
	element.className = className;
	appendChildElement(parentEl, element);
	return element;
}

function removeElement(element: HTMLElement): void {
	const removable = element as HTMLElement & {
		remove?: () => void;
		parentElement?: {
			removeChild?: (child: HTMLElement) => void;
		} | null;
	};
	if (typeof removable.remove === "function") {
		removable.remove();
		return;
	}

	removable.parentElement?.removeChild?.(element);
}

export interface RenderedEntryCard {
	cardEl: HTMLElement;
}

interface RenderedEntryCardBinding {
	cardEl: HTMLElement;
	entry: TotpEntryRecord;
	providerIconEl: HTMLElement;
	refs: EntryRowRefs;
	subtitleEl: HTMLElement | null;
	titleEl: HTMLElement;
	titleId: string;
}

export interface TotpManagerEntryCardRendererDependencies {
	resolveProviderIcon?: (entry: TotpEntryRecord) => string;
	setProviderIcon?: (element: HTMLElement, icon: string) => void;
}

export class TotpManagerEntryCardRenderer {
	private readonly bindings = new WeakMap<HTMLElement, RenderedEntryCardBinding>();
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
	): RenderedEntryCard {
		const cardEl = listEl.createDiv({
			cls: "twofa-entry-card",
		});
		cardEl.tabIndex = 0;

		const headerEl = cardEl.createDiv({
			cls: "twofa-entry-card__header",
		});
		const identityEl = headerEl.createDiv({
			cls: "twofa-entry-card__identity",
		});
		const providerIconEl = identityEl.createDiv({
			cls: "twofa-entry-card__provider-icon",
		});
		providerIconEl.setAttribute("aria-hidden", "true");
		const titleBlockEl = identityEl.createDiv({
			cls: "twofa-entry-card__title-block",
		});
		const titleId = `twofa-entry-title-${entry.id}`;
		const titleEl = titleBlockEl.createEl("div", {
			cls: "twofa-entry-card__title",
		});
		titleEl.setAttribute("id", titleId);

		const statusRailEl = headerEl.createDiv({
			cls: "twofa-entry-card__status-rail",
		});
		const countdownBadgeEl = statusRailEl.createDiv({
			cls: "twofa-entry-card__countdown-badge",
		});
		const countdownEl = countdownBadgeEl.createDiv({
			cls: "twofa-entry-card__countdown",
			text: "...",
		});

		const codeSectionEl = cardEl.createDiv({
			cls: "twofa-entry-card__code-section",
		});
		const codeRowEl = codeSectionEl.createDiv({
			cls: "twofa-entry-card__code-row",
		});
		const codeClusterEl = codeRowEl.createDiv({
			cls: "twofa-entry-card__code-cluster",
		});
		const codePrimaryEl = codeClusterEl.createDiv({
			cls: "twofa-entry-card__code-primary",
		});
		const codeEl = codePrimaryEl.createEl("code", {
			cls: "twofa-entry-card__code",
		});
		renderStaticCode(codeEl, CODE_PLACEHOLDER);

		let nextCodeEl: HTMLElement | null = null;
		let nextCodeRowEl: HTMLElement | null = null;
		if (showUpcomingCodes) {
			nextCodeRowEl = codeClusterEl.createDiv({
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
			cardEl,
			codeAnimationTimeoutId: null,
			codeAnimationToken: 0,
			codeEl,
			countdownBadgeEl,
			countdownEl,
			nextCodeEl,
			nextCodeRowEl,
			previousCurrentCode: null,
		};
		const binding: RenderedEntryCardBinding = {
			cardEl,
			entry,
			providerIconEl,
			refs,
			subtitleEl: null,
			titleEl,
			titleId,
		};
		this.bindings.set(cardEl, binding);
		this.bindCardEvents(binding);
		this.syncEntryCard(binding, entry);
		this.codeRefresh.registerRow(entry, refs);
		return {
			cardEl,
		};
	}

	updateEntryCard(renderedCard: RenderedEntryCard, entry: TotpEntryRecord): void {
		const binding = this.bindings.get(renderedCard.cardEl);
		if (!binding) {
			return;
		}

		binding.entry = entry;
		this.syncEntryCard(binding, entry);
		this.codeRefresh.registerRow(entry, binding.refs);
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

	private bindCardEvents(binding: RenderedEntryCardBinding): void {
		const { cardEl } = binding;
		cardEl.addEventListener("pointerdown", (event) => {
			this.actions.onCardPointerDown(binding.entry, event);
		});
		cardEl.addEventListener("pointermove", (event) => {
			this.actions.onCardPointerMove(binding.entry, cardEl, event);
		});
		cardEl.addEventListener("pointerup", (event) => {
			this.actions.onCardPointerEnd(binding.entry, cardEl, event);
		});
		cardEl.addEventListener("pointerleave", (event) => {
			this.actions.onCardPointerLeave(event);
		});
		cardEl.addEventListener("pointercancel", (event) => {
			this.actions.onCardPointerCancel(event);
		});
		cardEl.addEventListener("click", (event) => {
			this.actions.onCardClick(binding.entry, cardEl, event);
		});
		cardEl.addEventListener("contextmenu", (event) => {
			this.actions.onCardContextMenu(binding.entry, event);
		});
		cardEl.addEventListener("keydown", (event) => {
			this.actions.onCardKeyDown(binding.entry, cardEl, event);
		});
	}

	private syncEntryCard(
		binding: RenderedEntryCardBinding,
		entry: TotpEntryRecord,
	): void {
		this.syncProviderIcon(binding, entry);
		this.syncTitleBlock(binding, entry);
		this.syncCardSelectionState(binding.cardEl, entry.id);
	}

	private syncProviderIcon(
		binding: RenderedEntryCardBinding,
		entry: TotpEntryRecord,
	): void {
		const providerIconId = this.resolveProviderIcon(entry);
		if (binding.cardEl.getAttribute("data-provider-icon") === providerIconId) {
			return;
		}

		binding.providerIconEl.setAttribute("data-provider-icon", providerIconId);
		binding.cardEl.setAttribute("data-provider-icon", providerIconId);
		this.setProviderIcon(binding.providerIconEl, providerIconId);
	}

	private syncTitleBlock(
		binding: RenderedEntryCardBinding,
		entry: TotpEntryRecord,
	): void {
		syncTextContent(binding.titleEl, entry.issuer || entry.accountName);

		if (entry.issuer) {
			if (!binding.subtitleEl) {
				binding.subtitleEl = createDivElement(
					binding.titleEl.parentElement as HTMLElement,
					"twofa-entry-card__subtitle",
				);
			}

			const subtitleId = `twofa-entry-subtitle-${entry.id}`;
			binding.subtitleEl.setAttribute("id", subtitleId);
			syncTextContent(binding.subtitleEl, entry.accountName);
			binding.cardEl.setAttribute(
				"aria-labelledby",
				`${binding.titleId} ${subtitleId}`,
			);
			return;
		}

		if (binding.subtitleEl) {
			removeElement(binding.subtitleEl);
			binding.subtitleEl = null;
		}

		binding.cardEl.setAttribute("aria-labelledby", binding.titleId);
	}
}
