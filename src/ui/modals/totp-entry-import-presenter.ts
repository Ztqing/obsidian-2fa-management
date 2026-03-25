import type { TotpEntryDraft, TranslationVariables } from "../../types";
import {
	evaluateTotpEntryUriInput,
	importDraftFromQrImage,
	importDraftFromUri,
	type TotpEntryImportSource,
} from "./totp-entry-modal-controller";
import { getChangedDraftFields, type TotpEntryDraftField } from "./totp-entry-import";

export interface TotpEntryImportPresenterEnvironment {
	applyDraft(draft: TotpEntryDraft): void;
	clearImportSurfaceState(): void;
	getErrorMessage(error: unknown): string;
	readDraft(): TotpEntryDraft;
	setStatus(message: string, isError: boolean): void;
	setUriValue(value: string): void;
	showNotice(message: string): void;
	t: (key: string, variables?: TranslationVariables) => string;
}

export class TotpEntryImportPresenter {
	private importHighlightTimeout: number | null = null;

	constructor(
		private readonly environment: TotpEntryImportPresenterEnvironment,
		private readonly fieldElements: Partial<Record<TotpEntryDraftField, HTMLElement>>,
	) {}

	destroy(): void {
		this.clearImportHighlights();
	}

	maybeParseUri(value: string): void {
		const uriState = evaluateTotpEntryUriInput(value);

		if (uriState.kind === "ignore") {
			this.environment.setStatus("", false);
			return;
		}

		if (uriState.kind === "partial") {
			this.environment.setStatus(this.environment.t(uriState.statusKey), false);
			return;
		}

		this.importFromUri(uriState.value, false);
	}

	importFromUri(value: string, showSuccess = true): void {
		const result = importDraftFromUri(this.environment.readDraft(), value, {
			dependencies: {
				formatErrorMessage: (error) => this.environment.getErrorMessage(error),
				getChangedDraftFields,
			},
			showSuccessNotice: showSuccess,
		});
		this.applyImportResult(result);
	}

	async importQrImage(
		file: Blob,
		source: TotpEntryImportSource = "picker",
	): Promise<void> {
		this.environment.setStatus(this.environment.t("modal.entry.status.readingImage"), false);
		const result = await importDraftFromQrImage(
			this.environment.readDraft(),
			file,
			source,
			{
				dependencies: {
					formatErrorMessage: (error) => this.environment.getErrorMessage(error),
					getChangedDraftFields,
				},
			},
		);
		this.applyImportResult(result);
	}

	private applyImportResult(
		result: Awaited<ReturnType<typeof importDraftFromQrImage>> | ReturnType<typeof importDraftFromUri>,
	): void {
		if (result.kind === "error") {
			if (result.clearImportSurface) {
				this.environment.clearImportSurfaceState();
			}
			this.environment.setStatus(result.message, true);
			return;
		}

		if (result.uri) {
			this.environment.setUriValue(result.uri);
		}
		this.environment.applyDraft(result.draft);
		this.highlightFields(result.changedFields);
		this.environment.setStatus(this.environment.t(result.statusKey), false);
		if (result.noticeKey) {
			this.environment.showNotice(this.environment.t(result.noticeKey));
		}
	}

	private clearImportHighlights(): void {
		if (this.importHighlightTimeout !== null) {
			window.clearTimeout(this.importHighlightTimeout);
			this.importHighlightTimeout = null;
		}

		for (const element of Object.values(this.fieldElements)) {
			element?.removeClass("twofa-import-highlight");
		}
	}

	private highlightFields(changedFields: readonly TotpEntryDraftField[]): void {
		this.environment.clearImportSurfaceState();
		this.clearImportHighlights();

		if (changedFields.length === 0) {
			return;
		}

		for (const field of changedFields) {
			this.fieldElements[field]?.addClass("twofa-import-highlight");
		}

		this.importHighlightTimeout = window.setTimeout(() => {
			this.clearImportHighlights();
		}, 1800);
	}
}
