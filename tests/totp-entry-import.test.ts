import assert from "node:assert/strict";
import test from "node:test";
import {
	extractImageFileFromDataTransfer,
	extractImageFileFromItems,
	getChangedDraftFields,
} from "../src/ui/modals/totp-entry-import";
import type { TotpEntryDraft } from "../src/types";

const baseDraft: TotpEntryDraft = {
	issuer: "Example",
	accountName: "user@example.com",
	secret: "JBSWY3DPEHPK3PXP",
	algorithm: "SHA-1",
	digits: 6,
	period: 30,
};

test("extractImageFileFromItems returns the first available image blob", () => {
	const imageBlob = new Blob(["image"], {
		type: "image/png",
	});
	const file = extractImageFileFromItems([
		{
			type: "text/plain",
			getAsFile: () => null,
		},
		{
			type: "image/png",
			getAsFile: () => imageBlob,
		},
	]);

	assert.equal(file, imageBlob);
});

test("extractImageFileFromDataTransfer falls back to files when items are unavailable", () => {
	const imageBlob = new Blob(["image"], {
		type: "image/jpeg",
	});
	const file = extractImageFileFromDataTransfer({
		files: [imageBlob],
	});

	assert.equal(file, imageBlob);
});

test("getChangedDraftFields reports only fields changed by an import", () => {
	const changedFields = getChangedDraftFields(baseDraft, {
		...baseDraft,
		issuer: "Updated issuer",
		secret: "ABCDEFGHIJKLMNOP",
	});

	assert.deepEqual(changedFields, ["issuer", "secret"]);
});
