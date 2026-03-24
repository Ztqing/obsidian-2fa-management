import assert from "node:assert/strict";
import test from "node:test";
import { TwoFaUserError } from "../src/errors";
import {
	getNormalizedQrImageSize,
	parseOtpauthUriFromQrImage,
	validateQrPayload,
} from "../src/totp/qr";

async function createQrImageData(payload: string): Promise<{
	data: Uint8ClampedArray;
	height: number;
	width: number;
}> {
	const { default: qrcode } = await import("qrcode-generator");
	const qr = qrcode(0, "L");
	qr.addData(payload);
	qr.make();

	const moduleCount = qr.getModuleCount();
	const border = 4;
	const scale = 8;
	const width = (moduleCount + border * 2) * scale;
	const height = width;
	const data = new Uint8ClampedArray(width * height * 4);

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const moduleX = Math.floor(x / scale) - border;
			const moduleY = Math.floor(y / scale) - border;
			const isDark =
				moduleX >= 0 &&
				moduleX < moduleCount &&
				moduleY >= 0 &&
				moduleY < moduleCount &&
				qr.isDark(moduleY, moduleX);
			const color = isDark ? 0 : 255;
			const index = (y * width + x) * 4;
			data[index] = color;
			data[index + 1] = color;
			data[index + 2] = color;
			data[index + 3] = 255;
		}
	}

	return {
		data,
		height,
		width,
	};
}

test("validateQrPayload accepts otpauth URIs", () => {
	const uri =
		"otpauth://totp/Example:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example";

	assert.equal(validateQrPayload(uri), uri);
});

test("validateQrPayload rejects non-otpauth QR payloads", () => {
	assert.throws(() => {
		validateQrPayload("https://example.com/login");
	}, (error: unknown) => error instanceof TwoFaUserError && error.code === "otpauth_totp_only");
});

test("getNormalizedQrImageSize scales down oversized images while preserving aspect ratio", () => {
	assert.deepEqual(getNormalizedQrImageSize(6000, 3000), {
		height: 724,
		width: 1448,
	});
	assert.deepEqual(getNormalizedQrImageSize(400, 200), {
		height: 200,
		width: 400,
	});
});

test("parseOtpauthUriFromQrImage decodes a real QR payload through jsQR", async () => {
	const uri =
		"otpauth://totp/Example:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example";
	const imageData = await createQrImageData(uri);

	const decoded = await parseOtpauthUriFromQrImage(new Blob(["qr"]), {
		getImageData: async () => imageData,
	});

	assert.equal(decoded, uri);
});
