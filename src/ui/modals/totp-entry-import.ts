import type { TotpEntryDraft } from "../../types";

export type TotpEntryDraftField = keyof TotpEntryDraft;
export type OtpauthImportIntent = "ignore" | "partial" | "import";

export interface ClipboardImageItemLike {
	type: string;
	getAsFile?: () => Blob | null;
}

export interface DataTransferLike {
	items?: ArrayLike<ClipboardImageItemLike> | null;
	files?: ArrayLike<Blob> | null;
}

const ENTRY_DRAFT_FIELDS: readonly TotpEntryDraftField[] = [
	"issuer",
	"accountName",
	"secret",
	"algorithm",
	"digits",
	"period",
];

function isImageBlob(value: Blob | null | undefined): value is Blob {
	if (!value) {
		return false;
	}

	return typeof value.type === "string" && value.type.startsWith("image/");
}

export function extractImageFileFromItems(
	items: ArrayLike<ClipboardImageItemLike> | Iterable<ClipboardImageItemLike>,
): Blob | null {
	for (const item of Array.from(items)) {
		if (!item.type.startsWith("image/")) {
			continue;
		}

		const file = item.getAsFile?.();

		if (isImageBlob(file)) {
			return file;
		}
	}

	return null;
}

export function extractImageFileFromDataTransfer(
	dataTransfer: DataTransferLike | null | undefined,
): Blob | null {
	if (!dataTransfer) {
		return null;
	}

	const itemMatch =
		dataTransfer.items && extractImageFileFromItems(dataTransfer.items);

	if (itemMatch) {
		return itemMatch;
	}

	if (!dataTransfer.files) {
		return null;
	}

	for (const file of Array.from(dataTransfer.files)) {
		if (isImageBlob(file)) {
			return file;
		}
	}

	return null;
}

export function getChangedDraftFields(
	previous: TotpEntryDraft,
	next: TotpEntryDraft,
): TotpEntryDraftField[] {
	return ENTRY_DRAFT_FIELDS.filter((field) => previous[field] !== next[field]);
}

export function getOtpauthImportIntent(value: string): OtpauthImportIntent {
	const trimmedValue = value.trim();

	if (!trimmedValue.startsWith("otpauth://")) {
		return "ignore";
	}

	return trimmedValue.includes("secret=") ? "import" : "partial";
}
