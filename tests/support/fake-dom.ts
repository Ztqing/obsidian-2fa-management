type FakeListener = (event: any) => void;

class FakeClassList extends Set<string> {
	remove(className: string): void {
		this.delete(className);
	}
}

export class FakeElement {
	readonly attributes = new Map<string, string>();
	readonly children: FakeElement[] = [];
	readonly classList = new FakeClassList();
	readonly cssProps: Record<string, string> = {};
	readonly listeners = new Map<string, FakeListener[]>();
	checked = false;
	disabled = false;
	draggable = false;
	parentElement: FakeElement | null = null;
	placeholder = "";
	tabIndex = 0;
	textContent = "";
	type = "";
	value = "";

	private boundingRect = {
		height: 40,
		right: 120,
		top: 0,
		width: 120,
	};

	constructor(readonly tagName: string) {}

	createDiv(options: { cls?: string; text?: string } = {}): FakeElement {
		return this.createEl("div", options);
	}

	createEl(
		tagName: string,
		options: {
			cls?: string;
			placeholder?: string;
			text?: string;
			type?: string;
		} = {},
	): FakeElement {
		const element = new FakeElement(tagName);
		if (options.cls) {
			element.addClass(...options.cls.split(/\s+/).filter((className) => className.length > 0));
		}
		if (options.placeholder) {
			element.placeholder = options.placeholder;
		}
		if (options.text) {
			element.textContent = options.text;
		}
		if (options.type) {
			element.type = options.type;
		}
		element.parentElement = this;
		this.children.push(element);
		return element;
	}

	createSpan(options: { cls?: string; text?: string } = {}): FakeElement {
		return this.createEl("span", options);
	}

	appendChild(child: FakeElement): FakeElement {
		if (child.parentElement) {
			child.parentElement.removeChild(child);
		}

		child.parentElement = this;
		this.children.push(child);
		return child;
	}

	addClass(...classes: string[]): void {
		for (const className of classes) {
			if (className.length === 0) {
				continue;
			}

			if (/\s/.test(className)) {
				throw new Error(`Invalid class token: ${className}`);
			}

			this.classList.add(className);
		}
	}

	addEventListener(type: string, listener: FakeListener): void {
		const nextListeners = this.listeners.get(type) ?? [];
		nextListeners.push(listener);
		this.listeners.set(type, nextListeners);
	}

	dispatch(type: string, event: any = {}): void {
		for (const listener of this.listeners.get(type) ?? []) {
			listener(event);
		}
	}

	empty(): void {
		for (const child of this.children) {
			child.parentElement = null;
		}
		this.children.length = 0;
		this.textContent = "";
	}

	insertBefore(child: FakeElement, referenceChild: FakeElement | null): FakeElement {
		if (referenceChild === null) {
			return this.appendChild(child);
		}

		const referenceIndex = this.children.indexOf(referenceChild);
		if (referenceIndex === -1) {
			return this.appendChild(child);
		}

		if (child.parentElement) {
			child.parentElement.removeChild(child);
		}

		child.parentElement = this;
		this.children.splice(referenceIndex, 0, child);
		return child;
	}

	findByClass(className: string): FakeElement | null {
		if (this.classList.has(className)) {
			return this;
		}

		for (const child of this.children) {
			const match = child.findByClass(className);
			if (match) {
				return match;
			}
		}

		return null;
	}

	findAll(selector: string): FakeElement[] {
		if (!selector.startsWith(".")) {
			return [];
		}

		const className = selector.slice(1);
		const matches: FakeElement[] = [];
		if (this.classList.has(className)) {
			matches.push(this);
		}

		for (const child of this.children) {
			matches.push(...child.findAll(selector));
		}

		return matches;
	}

	findByTagName(tagName: string): FakeElement | null {
		if (this.tagName === tagName) {
			return this;
		}

		for (const child of this.children) {
			const match = child.findByTagName(tagName);
			if (match) {
				return match;
			}
		}

		return null;
	}

	findByText(text: string): FakeElement | null {
		if (this.textContent === text) {
			return this;
		}

		for (const child of this.children) {
			const match = child.findByText(text);
			if (match) {
				return match;
			}
		}

		return null;
	}

	getAttribute(name: string): string | null {
		return this.attributes.get(name) ?? null;
	}

	getBoundingClientRect(): {
		height: number;
		right: number;
		top: number;
		width: number;
	} {
		return { ...this.boundingRect };
	}

	hasClass(className: string): boolean {
		return this.classList.has(className);
	}

	removeClass(value: string): void {
		this.classList.delete(value);
	}

	removeChild(child: FakeElement): FakeElement {
		const childIndex = this.children.indexOf(child);
		if (childIndex >= 0) {
			this.children.splice(childIndex, 1);
			child.parentElement = null;
		}

		return child;
	}

	remove(): void {
		this.parentElement?.removeChild(this);
	}

	setBoundingClientRect(rect: {
		height: number;
		right: number;
		top: number;
		width: number;
	}): void {
		this.boundingRect = { ...rect };
	}

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
	}

	setCssProps(props: Record<string, string>): void {
		Object.assign(this.cssProps, props);
	}

	setText(text: string): void {
		this.children.length = 0;
		this.textContent = text;
	}

	toggleClass(className: string, force?: boolean): void {
		if (force === undefined) {
			if (this.classList.has(className)) {
				this.classList.delete(className);
			} else {
				this.classList.add(className);
			}
			return;
		}

		if (force) {
			this.classList.add(className);
			return;
		}

		this.classList.delete(className);
	}
}

export function collectTextContent(root: FakeElement): string[] {
	return [
		root.textContent,
		...root.children.flatMap((child) => collectTextContent(child)),
	].filter((value) => value.length > 0);
}
