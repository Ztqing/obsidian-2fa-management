import { Menu } from "obsidian";
import type { TotpEntryRecord } from "../../types";

export interface TotpManagerViewMenuItemLike {
	onClick(callback: () => void): this;
	setDanger(isDanger?: boolean): this;
	setIcon(icon: string): this;
	setTitle(title: string): this;
}

export interface TotpManagerViewMenuLike {
	addItem(callback: (item: TotpManagerViewMenuItemLike) => void): this;
	addSeparator(): this;
	showAtMouseEvent(event: MouseEvent): void;
	showAtPosition(position: {
		left?: boolean;
		width?: number;
		x: number;
		y: number;
	}): void;
}

export type MenuTarget = MouseEvent | Pick<HTMLElement, "getBoundingClientRect">;

interface ObsidianMenuItemLike {
	onClick(callback: (event: MouseEvent | KeyboardEvent) => void): this;
	setIcon(icon: string | null): this;
	setTitle(title: string | DocumentFragment): this;
}

function createDangerMenuTitle(title: string): string | DocumentFragment {
	if (
		typeof document === "undefined" ||
		typeof document.createDocumentFragment !== "function"
	) {
		return title;
	}

	const fragment = document.createDocumentFragment();
	const label = document.createElement("span");
	label.className = "twofa-menu-item-danger";
	label.textContent = title;
	fragment.append(label);
	return fragment;
}

class TotpManagerViewMenuItemAdapter implements TotpManagerViewMenuItemLike {
	private isDanger = false;
	private title = "";

	constructor(private readonly item: ObsidianMenuItemLike) {}

	onClick(callback: () => void): this {
		this.item.onClick(() => {
			callback();
		});
		return this;
	}

	setDanger(isDanger = true): this {
		this.isDanger = isDanger;
		this.applyTitle();
		return this;
	}

	setIcon(icon: string): this {
		this.item.setIcon(icon);
		return this;
	}

	setTitle(title: string): this {
		this.title = title;
		this.applyTitle();
		return this;
	}

	private applyTitle(): void {
		if (this.title.length === 0) {
			return;
		}

		this.item.setTitle(
			this.isDanger ? createDangerMenuTitle(this.title) : this.title,
		);
	}
}

export class TotpManagerViewMenuAdapter implements TotpManagerViewMenuLike {
	private readonly menu = new Menu().setUseNativeMenu(false);

	addItem(callback: (item: TotpManagerViewMenuItemLike) => void): this {
		this.menu.addItem((item) => {
			callback(new TotpManagerViewMenuItemAdapter(item));
		});
		return this;
	}

	addSeparator(): this {
		this.menu.addSeparator();
		return this;
	}

	showAtMouseEvent(event: MouseEvent): void {
		this.menu.showAtMouseEvent(event);
	}

	showAtPosition(position: {
		left?: boolean;
		width?: number;
		x: number;
		y: number;
	}): void {
		this.menu.showAtPosition(position);
	}
}

function isMouseEventTarget(target: MenuTarget): target is MouseEvent {
	return (
		typeof (target as MouseEvent).clientX === "number" &&
		typeof (target as MouseEvent).clientY === "number"
	);
}

function getMenuPositionFromTarget(target: MenuTarget): {
	left?: boolean;
	width?: number;
	x: number;
	y: number;
} {
	if (isMouseEventTarget(target)) {
		return {
			x: target.clientX,
			y: target.clientY,
		};
	}

	const rect = target.getBoundingClientRect();
	return {
		x: rect.right - 12,
		y: rect.top + Math.min(rect.height / 2, 48),
		width: rect.width,
		left: true,
	};
}

interface TotpManagerViewMenuControllerEnvironment {
	createMenu(): TotpManagerViewMenuLike;
	t(key: string): string;
}

export class TotpManagerViewMenuController {
	constructor(
		private readonly environment: TotpManagerViewMenuControllerEnvironment,
	) {}

	openEntryContextMenu(
		entry: TotpEntryRecord,
		target: MenuTarget,
		actions: {
			onDeleteEntry: (entry: TotpEntryRecord) => void;
			onEditEntry: (entry: TotpEntryRecord) => void;
			onEnterSelectionMode: (entryId: string) => void;
		},
	): void {
		const menu = this.environment.createMenu();
		menu.addItem((item) => {
			item
				.setTitle(this.environment.t("common.multiSelect"))
				.setIcon("check-square")
				.onClick(() => {
					actions.onEnterSelectionMode(entry.id);
				});
		});
		menu.addSeparator();
		menu.addItem((item) => {
			item
				.setTitle(this.environment.t("common.edit"))
				.setIcon("pencil")
				.onClick(() => {
					actions.onEditEntry(entry);
				});
		});
		menu.addItem((item) => {
			item
				.setTitle(this.environment.t("common.delete"))
				.setDanger()
				.setIcon("trash-2")
				.onClick(() => {
					actions.onDeleteEntry(entry);
				});
		});
		this.showMenuAtTarget(menu, target);
	}

	openToolbarMenu(
		target: MenuTarget,
		options: {
			hasVisibleEntries: boolean;
			onBulkImport: () => void;
			onEnterSelectionMode: () => void;
			onLockVault: () => void;
		},
	): void {
		const menu = this.environment.createMenu();
		menu.addItem((item) => {
			item
				.setTitle(this.environment.t("common.bulkImport"))
				.setIcon("upload")
				.onClick(() => {
					options.onBulkImport();
				});
		});

		if (options.hasVisibleEntries) {
			menu.addItem((item) => {
				item
					.setTitle(this.environment.t("common.multiSelect"))
					.setIcon("check-square")
					.onClick(() => {
						options.onEnterSelectionMode();
					});
			});
		}

		menu.addSeparator();
		menu.addItem((item) => {
			item
				.setTitle(this.environment.t("common.lock"))
				.setDanger()
				.setIcon("lock")
				.onClick(() => {
					options.onLockVault();
				});
		});
		this.showMenuAtTarget(menu, target);
	}

	private showMenuAtTarget(menu: TotpManagerViewMenuLike, target: MenuTarget): void {
		if (isMouseEventTarget(target)) {
			menu.showAtMouseEvent(target);
			return;
		}

		menu.showAtPosition(getMenuPositionFromTarget(target));
	}
}
