import { DropdownComponent, Setting, TextComponent } from "obsidian";
import { DEFAULT_TOTP_ENTRY } from "../../constants";
import type { TranslationKey } from "../../i18n/translations";
import type { TotpAlgorithm, TotpEntryDraft } from "../../types";
import type { TotpEntryDraftField } from "./totp-entry-import";

export interface TotpEntryFormEnvironment {
	t: (key: TranslationKey) => string;
}

export interface TotpEntryForm {
	applyDraft(draft: TotpEntryDraft): void;
	focusPrimaryField(): void;
	getFieldElements(): Partial<Record<TotpEntryDraftField, HTMLElement>>;
	readDraft(): TotpEntryDraft;
}

class TotpEntryFormController implements TotpEntryForm {
	private issuerInput: TextComponent | null = null;
	private accountNameInput: TextComponent | null = null;
	private secretInput: TextComponent | null = null;
	private digitsInput: TextComponent | null = null;
	private periodInput: TextComponent | null = null;
	private algorithmInput: DropdownComponent | null = null;
	private readonly fieldElements: Partial<Record<TotpEntryDraftField, HTMLElement>> = {};

	constructor(
		private readonly environment: TotpEntryFormEnvironment,
		private readonly containerEl: HTMLElement,
		private readonly initialDraft: TotpEntryDraft,
	) {
		this.render();
	}

	applyDraft(draft: TotpEntryDraft): void {
		this.issuerInput?.setValue(draft.issuer);
		this.accountNameInput?.setValue(draft.accountName);
		this.secretInput?.setValue(draft.secret);
		this.algorithmInput?.setValue(draft.algorithm);
		this.digitsInput?.setValue(String(draft.digits));
		this.periodInput?.setValue(String(draft.period));
	}

	focusPrimaryField(): void {
		this.accountNameInput?.inputEl.focus();
	}

	getFieldElements(): Partial<Record<TotpEntryDraftField, HTMLElement>> {
		return this.fieldElements;
	}

	readDraft(): TotpEntryDraft {
		return {
			issuer: this.issuerInput?.getValue() ?? "",
			accountName: this.accountNameInput?.getValue() ?? "",
			secret: this.secretInput?.getValue() ?? "",
			algorithm: (this.algorithmInput?.getValue() ?? DEFAULT_TOTP_ENTRY.algorithm) as TotpAlgorithm,
			digits: Number(this.digitsInput?.getValue() ?? DEFAULT_TOTP_ENTRY.digits),
			period: Number(this.periodInput?.getValue() ?? DEFAULT_TOTP_ENTRY.period),
		};
	}

	private render(): void {
		const detailsSection = this.containerEl.createDiv({
			cls: "twofa-entry-modal__section twofa-entry-modal__section--details",
		});
		detailsSection.createEl("h4", {
			cls: "twofa-entry-modal__section-title",
			text: this.environment.t("modal.entry.detailsSection"),
		});

		const issuerSetting = new Setting(detailsSection)
			.setName(this.environment.t("modal.entry.issuer.name"))
			.setDesc(this.environment.t("modal.entry.issuer.description"))
			.addText((text) => {
				this.issuerInput = text;
				text.inputEl.placeholder = this.environment.t("modal.entry.issuer.placeholder");
				text.setValue(this.initialDraft.issuer);
			});
		this.fieldElements.issuer = this.issuerInput?.inputEl ?? issuerSetting.settingEl;

		const accountNameSetting = new Setting(detailsSection)
			.setName(this.environment.t("modal.entry.accountName.name"))
			.setDesc(this.environment.t("modal.entry.accountName.description"))
			.addText((text) => {
				this.accountNameInput = text;
				text.inputEl.placeholder = this.environment.t("modal.entry.accountName.placeholder");
				text.setValue(this.initialDraft.accountName);
			});
		this.fieldElements.accountName =
			this.accountNameInput?.inputEl ?? accountNameSetting.settingEl;

		const secretSetting = new Setting(detailsSection)
			.setName(this.environment.t("modal.entry.secret.name"))
			.setDesc(this.environment.t("modal.entry.secret.description"))
			.addText((text) => {
				this.secretInput = text;
				text.inputEl.type = "password";
				text.inputEl.placeholder = this.environment.t("modal.entry.secret.placeholder");
				text.inputEl.autocomplete = "off";
				text.setValue(this.initialDraft.secret);
			});
		this.fieldElements.secret = this.secretInput?.inputEl ?? secretSetting.settingEl;

		const algorithmSetting = new Setting(detailsSection)
			.setName(this.environment.t("modal.entry.algorithm.name"))
			.setDesc(this.environment.t("modal.entry.algorithm.description"))
			.addDropdown((dropdown) => {
				this.algorithmInput = dropdown;
				dropdown.addOptions({
					"SHA-1": "SHA-1",
					"SHA-256": "SHA-256",
					"SHA-512": "SHA-512",
				});
				dropdown.setValue(this.initialDraft.algorithm);
			});
		this.fieldElements.algorithm =
			this.algorithmInput?.selectEl ?? algorithmSetting.settingEl;

		const digitsSetting = new Setting(detailsSection)
			.setName(this.environment.t("modal.entry.digits.name"))
			.setDesc(this.environment.t("modal.entry.digits.description"))
			.addText((text) => {
				this.digitsInput = text;
				text.inputEl.type = "number";
				text.inputEl.min = "6";
				text.inputEl.max = "10";
				text.setValue(String(this.initialDraft.digits));
			});
		this.fieldElements.digits = this.digitsInput?.inputEl ?? digitsSetting.settingEl;

		const periodSetting = new Setting(detailsSection)
			.setName(this.environment.t("modal.entry.period.name"))
			.setDesc(this.environment.t("modal.entry.period.description"))
			.addText((text) => {
				this.periodInput = text;
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.max = "300";
				text.setValue(String(this.initialDraft.period));
			});
		this.fieldElements.period = this.periodInput?.inputEl ?? periodSetting.settingEl;
	}
}

export function createTotpEntryForm(
	environment: TotpEntryFormEnvironment,
	containerEl: HTMLElement,
	initialDraft: TotpEntryDraft,
): TotpEntryForm {
	return new TotpEntryFormController(environment, containerEl, initialDraft);
}
