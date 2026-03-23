import { parseOtpauthUri } from "../../totp/otpauth";
import { parseOtpauthUriFromQrImage } from "../../totp/qr";
import type { TotpEntryDraft } from "../../types";
import {
	getChangedDraftFields,
	getOtpauthImportIntent,
	type TotpEntryDraftField,
} from "./totp-entry-import";

export type TotpEntryImportSource = "clipboard" | "drop" | "picker";

export type TotpEntryImportStatusKey =
	| "modal.entry.status.importedDroppedImage"
	| "modal.entry.status.importedImage"
	| "modal.entry.status.importedLink"
	| "modal.entry.status.importedPastedImage"
	| "modal.entry.status.partialLink";

export type TotpEntryImportNoticeKey = "notice.imageImported" | "notice.linkImported";

export interface TotpEntryImportDependencies {
	formatErrorMessage(error: unknown): string;
	getChangedDraftFields(
		previous: TotpEntryDraft,
		next: TotpEntryDraft,
	): TotpEntryDraftField[];
	parseOtpauthUri(value: string): TotpEntryDraft;
	parseOtpauthUriFromQrImage(file: Blob): Promise<string>;
}

export interface TotpEntryImportErrorResult {
	clearImportSurface: boolean;
	kind: "error";
	message: string;
}

export interface TotpEntryImportSuccessResult {
	changedFields: TotpEntryDraftField[];
	clearImportSurface: boolean;
	draft: TotpEntryDraft;
	kind: "success";
	noticeKey?: TotpEntryImportNoticeKey;
	statusKey: TotpEntryImportStatusKey;
	uri?: string;
}

export type TotpEntryImportResult =
	| TotpEntryImportErrorResult
	| TotpEntryImportSuccessResult;

export type TotpEntryUriInputState =
	| {
			kind: "ignore";
	  }
	| {
			kind: "partial";
			statusKey: "modal.entry.status.partialLink";
	  }
	| {
			kind: "ready";
			value: string;
	  };

const defaultImportDependencies: TotpEntryImportDependencies = {
	formatErrorMessage: (error) => (error instanceof Error ? error.message : String(error)),
	getChangedDraftFields,
	parseOtpauthUri,
	parseOtpauthUriFromQrImage,
};

function getQrImportStatusKey(source: TotpEntryImportSource): TotpEntryImportStatusKey {
	if (source === "clipboard") {
		return "modal.entry.status.importedPastedImage";
	}

	if (source === "drop") {
		return "modal.entry.status.importedDroppedImage";
	}

	return "modal.entry.status.importedImage";
}

export function evaluateTotpEntryUriInput(value: string): TotpEntryUriInputState {
	const importIntent = getOtpauthImportIntent(value);

	if (importIntent === "ignore") {
		return {
			kind: "ignore",
		};
	}

	if (importIntent === "partial") {
		return {
			kind: "partial",
			statusKey: "modal.entry.status.partialLink",
		};
	}

	return {
		kind: "ready",
		value: value.trim(),
	};
}

export function importDraftFromUri(
	currentDraft: TotpEntryDraft,
	value: string,
	options: {
		dependencies?: Partial<TotpEntryImportDependencies>;
		showSuccessNotice?: boolean;
	} = {},
): TotpEntryImportResult {
	const dependencies = {
		...defaultImportDependencies,
		...options.dependencies,
	};

	try {
		const parsedDraft = dependencies.parseOtpauthUri(value);

		return {
			changedFields: dependencies.getChangedDraftFields(currentDraft, parsedDraft),
			clearImportSurface: true,
			draft: parsedDraft,
			kind: "success",
			noticeKey: options.showSuccessNotice ? "notice.linkImported" : undefined,
			statusKey: "modal.entry.status.importedLink",
		};
	} catch (error) {
		return {
			clearImportSurface: false,
			kind: "error",
			message: dependencies.formatErrorMessage(error),
		};
	}
}

export async function importDraftFromQrImage(
	currentDraft: TotpEntryDraft,
	file: Blob,
	source: TotpEntryImportSource,
	options: {
		dependencies?: Partial<TotpEntryImportDependencies>;
	} = {},
): Promise<TotpEntryImportResult> {
	const dependencies = {
		...defaultImportDependencies,
		...options.dependencies,
	};

	try {
		const uri = await dependencies.parseOtpauthUriFromQrImage(file);
		const parsedDraft = dependencies.parseOtpauthUri(uri);

		return {
			changedFields: dependencies.getChangedDraftFields(currentDraft, parsedDraft),
			clearImportSurface: true,
			draft: parsedDraft,
			kind: "success",
			noticeKey: "notice.imageImported",
			statusKey: getQrImportStatusKey(source),
			uri,
		};
	} catch (error) {
		return {
			clearImportSurface: true,
			kind: "error",
			message: dependencies.formatErrorMessage(error),
		};
	}
}

export interface TotpEntryImportSurfaceChange {
	active: boolean;
	acceptsImage: boolean;
	preventDefault: boolean;
}

export class TotpEntryImportSurfaceController {
	private dragDepth = 0;

	handleDragEnter(hasImageFile: boolean): TotpEntryImportSurfaceChange {
		if (!hasImageFile) {
			return {
				active: false,
				acceptsImage: false,
				preventDefault: false,
			};
		}

		this.dragDepth += 1;
		return {
			active: true,
			acceptsImage: true,
			preventDefault: true,
		};
	}

	handleDragLeave(hasImageFile: boolean): TotpEntryImportSurfaceChange {
		if (!hasImageFile) {
			return {
				active: this.isActive(),
				acceptsImage: false,
				preventDefault: false,
			};
		}

		this.dragDepth = Math.max(0, this.dragDepth - 1);
		return {
			active: this.isActive(),
			acceptsImage: true,
			preventDefault: true,
		};
	}

	handleDragOver(hasImageFile: boolean): TotpEntryImportSurfaceChange {
		if (!hasImageFile) {
			return {
				active: this.isActive(),
				acceptsImage: false,
				preventDefault: false,
			};
		}

		return {
			active: true,
			acceptsImage: true,
			preventDefault: true,
		};
	}

	handleDrop(hasImageFile: boolean): TotpEntryImportSurfaceChange {
		if (!hasImageFile) {
			return {
				active: this.isActive(),
				acceptsImage: false,
				preventDefault: false,
			};
		}

		this.dragDepth = 0;
		return {
			active: true,
			acceptsImage: true,
			preventDefault: true,
		};
	}

	reset(): void {
		this.dragDepth = 0;
	}

	private isActive(): boolean {
		return this.dragDepth > 0;
	}
}
