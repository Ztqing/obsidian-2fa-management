import assert from "node:assert/strict";
import test from "node:test";
import {
	TotpEntryImportSurfaceController,
	evaluateTotpEntryUriInput,
	importDraftFromQrImage,
	importDraftFromUri,
} from "../src/ui/modals/totp-entry-modal-controller";
import type { TotpEntryDraft } from "../src/types";

const baseDraft: TotpEntryDraft = {
	accountName: "user@example.com",
	algorithm: "SHA-1",
	digits: 6,
	issuer: "Example",
	period: 30,
	secret: "JBSWY3DPEHPK3PXP",
};

test("evaluateTotpEntryUriInput distinguishes ignore, partial, and ready states", () => {
	assert.deepEqual(evaluateTotpEntryUriInput("plain text"), {
		kind: "ignore",
	});

	assert.deepEqual(
		evaluateTotpEntryUriInput(" otpauth://totp/Issuer:user@example.com "),
		{
			kind: "partial",
			statusKey: "modal.entry.status.partialLink",
		},
	);

	assert.deepEqual(
		evaluateTotpEntryUriInput(
			" otpauth://totp/Issuer:user@example.com?secret=JBSWY3DPEHPK3PXP ",
		),
		{
			kind: "ready",
			value: "otpauth://totp/Issuer:user@example.com?secret=JBSWY3DPEHPK3PXP",
		},
	);
});

test("importDraftFromUri returns changed fields and optional success notice", () => {
	const result = importDraftFromUri(
		baseDraft,
		"otpauth://totp/New%20Issuer:new@example.com?secret=ABCDEFGHIJKLMNOP",
		{
			showSuccessNotice: true,
		},
	);

	assert.equal(result.kind, "success");
	if (result.kind !== "success") {
		return;
	}

	assert.equal(result.noticeKey, "notice.linkImported");
	assert.equal(result.statusKey, "modal.entry.status.importedLink");
	assert.deepEqual(result.changedFields, ["issuer", "accountName", "secret"]);
	assert.equal(result.draft.issuer, "New Issuer");
});

test("importDraftFromUri formats parser failures as error results", () => {
	const result = importDraftFromUri(baseDraft, "otpauth://totp/invalid", {
		dependencies: {
			formatErrorMessage: () => "formatted-error",
			parseOtpauthUri: () => {
				throw new Error("boom");
			},
		},
	});

	assert.deepEqual(result, {
		clearImportSurface: false,
		kind: "error",
		message: "formatted-error",
	});
});

test("importDraftFromQrImage maps clipboard/drop/picker imports to the right status keys", async () => {
	const testCases = [
		["clipboard", "modal.entry.status.importedPastedImage"],
		["drop", "modal.entry.status.importedDroppedImage"],
		["picker", "modal.entry.status.importedImage"],
	] as const;

	for (const [source, statusKey] of testCases) {
		const result = await importDraftFromQrImage(baseDraft, new Blob(["image"]), source, {
			dependencies: {
				parseOtpauthUri: () => ({
					...baseDraft,
					accountName: `${source}@example.com`,
				}),
				parseOtpauthUriFromQrImage: async () =>
					"otpauth://totp/Example:user@example.com?secret=ABCDEFGHIJKLMNOP",
			},
		});

		assert.equal(result.kind, "success");
		if (result.kind !== "success") {
			continue;
		}

		assert.equal(result.noticeKey, "notice.imageImported");
		assert.equal(result.statusKey, statusKey);
		assert.equal(result.uri?.startsWith("otpauth://"), true);
		assert.equal(result.changedFields.includes("accountName"), true);
	}
});

test("TotpEntryImportSurfaceController tracks nested drag state transitions", () => {
	const controller = new TotpEntryImportSurfaceController();

	assert.deepEqual(controller.handleDragEnter(true), {
		active: true,
		acceptsImage: true,
		preventDefault: true,
	});
	assert.deepEqual(controller.handleDragEnter(true), {
		active: true,
		acceptsImage: true,
		preventDefault: true,
	});
	assert.deepEqual(controller.handleDragLeave(true), {
		active: true,
		acceptsImage: true,
		preventDefault: true,
	});
	assert.deepEqual(controller.handleDragLeave(true), {
		active: false,
		acceptsImage: true,
		preventDefault: true,
	});
	assert.deepEqual(controller.handleDrop(true), {
		active: true,
		acceptsImage: true,
		preventDefault: true,
	});
});
