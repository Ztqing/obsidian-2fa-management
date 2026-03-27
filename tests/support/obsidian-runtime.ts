import { FakeElement } from "./fake-dom";

type ButtonRegistration = {
	component: ButtonComponent;
	settingName: string;
};

type DropdownRegistration = {
	component: DropdownComponent;
	settingName: string;
};

type TextRegistration = {
	component: TextComponent;
	settingName: string;
};

type ToggleRegistration = {
	component: ToggleComponent;
	settingName: string;
};

interface RuntimeState {
	buttons: ButtonRegistration[];
	dropdowns: DropdownRegistration[];
	language: string;
	notices: string[];
	texts: TextRegistration[];
	toggles: ToggleRegistration[];
}

const runtimeState: RuntimeState = {
	buttons: [],
	dropdowns: [],
	language: "en",
	notices: [],
	texts: [],
	toggles: [],
};

function getSettingName(parentEl: FakeElement): string {
	return parentEl.findByClass("setting-item-name")?.textContent ?? "";
}

export function resetObsidianRuntime(): void {
	runtimeState.buttons.length = 0;
	runtimeState.dropdowns.length = 0;
	runtimeState.notices.length = 0;
	runtimeState.texts.length = 0;
	runtimeState.toggles.length = 0;
	runtimeState.language = "en";
}

export function setObsidianLanguage(language: string): void {
	runtimeState.language = language;
}

export function getObsidianRuntimeState(): RuntimeState {
	return runtimeState;
}

export class App {}

export class WorkspaceLeaf {
	viewState: unknown = null;

	async setViewState(viewState: unknown): Promise<void> {
		this.viewState = viewState;
	}
}

export class Plugin {
	app: unknown;

	constructor(app: unknown = {}) {
		this.app = app;
	}

	addCommand(): void {}

	addSettingTab(): void {}

	loadData(): Promise<unknown> {
		return Promise.resolve(null);
	}

	registerDomEvent(): void {}

	registerInterval(): void {}

	registerView(): void {}

	saveData(): Promise<void> {
		return Promise.resolve();
	}
}

export class ItemView {
	readonly actions: Array<{
		callback: () => void;
		icon: string;
		title: string;
	}> = [];
	readonly contentEl = new FakeElement("div") as unknown as HTMLElement;
	readonly domEvents: Array<{
		eventName: string;
		listener: (event: unknown) => void;
		target: unknown;
	}> = [];
	readonly intervals: number[] = [];
	navigation = true;

	constructor(readonly leaf: WorkspaceLeaf) {}

	addAction(icon: string, title: string, callback: () => void): void {
		this.actions.push({
			callback,
			icon,
			title,
		});
	}

	async onClose(): Promise<void> {}

	async onOpen(): Promise<void> {}

	registerDomEvent(
		target: unknown,
		eventName: string,
		listener: (event: unknown) => void,
	): void {
		this.domEvents.push({
			eventName,
			listener,
			target,
		});
	}

	registerInterval(intervalId: number): void {
		this.intervals.push(intervalId);
	}
}

export class PluginSettingTab {
	readonly containerEl = new FakeElement("div") as unknown as HTMLElement;

	constructor(
		readonly app: App,
		readonly plugin: Plugin,
	) {}
}

class ButtonComponent {
	private clickHandler: (() => void) | null = null;
	readonly buttonEl: FakeElement;

	constructor(parentEl: FakeElement) {
		this.buttonEl = parentEl.createEl("button");
		this.buttonEl.addEventListener("click", () => {
			this.clickHandler?.();
		});
	}

	onClick(callback: () => void): this {
		this.clickHandler = callback;
		return this;
	}

	setButtonText(text: string): this {
		this.buttonEl.setText(text);
		return this;
	}

	setCta(): this {
		this.buttonEl.addClass("mod-cta");
		return this;
	}

	setWarning(): this {
		this.buttonEl.addClass("mod-warning");
		return this;
	}

	triggerClick(): void {
		this.buttonEl.dispatch("click");
	}
}

class DropdownComponent {
	private changeHandler: ((value: string) => void) | null = null;
	readonly selectEl: FakeElement;

	constructor(parentEl: FakeElement) {
		this.selectEl = parentEl.createEl("select");
		this.selectEl.addEventListener("change", () => {
			this.changeHandler?.(this.selectEl.value);
		});
	}

	addOptions(_options: Record<string, string>): this {
		return this;
	}

	onChange(callback: (value: string) => void): this {
		this.changeHandler = callback;
		return this;
	}

	setValue(value: string): this {
		this.selectEl.value = value;
		return this;
	}

	triggerChange(value: string): void {
		this.selectEl.value = value;
		this.selectEl.dispatch("change");
	}
}

export class Notice {
	constructor(message: string) {
		runtimeState.notices.push(message);
	}
}

export class Setting {
	private readonly settingEl: FakeElement;

	constructor(containerEl: HTMLElement) {
		this.settingEl = (containerEl as unknown as FakeElement).createDiv({
			cls: "setting-item",
		});
	}

	addButton(callback: (button: ButtonComponent) => void): this {
		const component = new ButtonComponent(this.settingEl);
		runtimeState.buttons.push({
			component,
			settingName: getSettingName(this.settingEl),
		});
		callback(component);
		return this;
	}

	addDropdown(callback: (dropdown: DropdownComponent) => void): this {
		const component = new DropdownComponent(this.settingEl);
		runtimeState.dropdowns.push({
			component,
			settingName: getSettingName(this.settingEl),
		});
		callback(component);
		return this;
	}

	addText(callback: (text: TextComponent) => void): this {
		const component = new TextComponent(this.settingEl);
		runtimeState.texts.push({
			component,
			settingName: getSettingName(this.settingEl),
		});
		callback(component);
		return this;
	}

	addToggle(callback: (toggle: ToggleComponent) => void): this {
		const component = new ToggleComponent(this.settingEl);
		runtimeState.toggles.push({
			component,
			settingName: getSettingName(this.settingEl),
		});
		callback(component);
		return this;
	}

	setDesc(description: string): this {
		this.settingEl.createDiv({
			cls: "setting-item-description",
			text: description,
		});
		return this;
	}

	setHeading(): this {
		this.settingEl.addClass("setting-item-heading");
		return this;
	}

	setName(name: string): this {
		this.settingEl.createDiv({
			cls: "setting-item-name",
			text: name,
		});
		return this;
	}
}

export function getLanguage(): string {
	return runtimeState.language;
}

export function setIcon(): void {}

export class TextComponent {
	readonly inputEl: FakeElement;

	constructor(parentEl: FakeElement) {
		this.inputEl = parentEl.createEl("input");
	}

	getValue(): string {
		return this.inputEl.value;
	}

	setValue(value: string): this {
		this.inputEl.value = value;
		return this;
	}
}

class ToggleComponent {
	private changeHandler: ((value: boolean) => void) | null = null;
	readonly toggleEl: FakeElement;

	constructor(parentEl: FakeElement) {
		this.toggleEl = parentEl.createEl("input", {
			type: "checkbox",
		});
		this.toggleEl.addEventListener("change", () => {
			this.changeHandler?.(this.toggleEl.checked);
		});
	}

	onChange(callback: (value: boolean) => void): this {
		this.changeHandler = callback;
		return this;
	}

	setValue(value: boolean): this {
		this.toggleEl.checked = value;
		return this;
	}

	triggerChange(value: boolean): void {
		this.toggleEl.checked = value;
		this.toggleEl.dispatch("change");
	}
}
