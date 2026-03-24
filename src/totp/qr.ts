import jsQR from "jsqr";
import {
	QR_IMPORT_MAX_DIMENSION,
	QR_IMPORT_MAX_PIXELS,
} from "../constants";
import { createUserError } from "../errors";
import { parseOtpauthUri } from "./otpauth";

export interface QrImageDataLike {
	data: Uint8ClampedArray;
	height: number;
	width: number;
}

export function getNormalizedQrImageSize(
	width: number,
	height: number,
): {
	height: number;
	width: number;
} {
	if (
		!Number.isFinite(width) ||
		!Number.isFinite(height) ||
		width <= 0 ||
		height <= 0
	) {
		throw createUserError("image_read_failed");
	}

	const scaleByDimension = Math.min(
		1,
		QR_IMPORT_MAX_DIMENSION / width,
		QR_IMPORT_MAX_DIMENSION / height,
	);
	const scaleByPixels = Math.min(
		1,
		Math.sqrt(QR_IMPORT_MAX_PIXELS / (width * height)),
	);
	const scale = Math.min(scaleByDimension, scaleByPixels);

	return {
		height: Math.max(1, Math.round(height * scale)),
		width: Math.max(1, Math.round(width * scale)),
	};
}

async function blobToImageBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
	if (typeof createImageBitmap === "function") {
		return createImageBitmap(blob);
	}

	return new Promise((resolve, reject) => {
		const imageUrl = URL.createObjectURL(blob);
		const image = new Image();
		image.onload = () => {
			URL.revokeObjectURL(imageUrl);
			resolve(image);
		};
		image.onerror = () => {
			URL.revokeObjectURL(imageUrl);
			reject(createUserError("image_read_failed"));
		};
		image.src = imageUrl;
	});
}

async function getImageData(blob: Blob): Promise<ImageData> {
	const image = await blobToImageBitmap(blob);
	const { width, height } = getNormalizedQrImageSize(image.width, image.height);
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;

	const context = canvas.getContext("2d", {
		willReadFrequently: true,
	});

	if (!context) {
		throw createUserError("image_pixels_unavailable");
	}

	context.drawImage(image, 0, 0, width, height);

	if ("close" in image && typeof image.close === "function") {
		image.close();
	}

	return context.getImageData(0, 0, width, height);
}

export function decodeOtpauthUriFromImageData(imageData: QrImageDataLike): string {
	const result = jsQR(imageData.data, imageData.width, imageData.height, {
		inversionAttempts: "attemptBoth",
	});

	if (!result) {
		throw createUserError("qr_not_found");
	}

	return validateQrPayload(result.data);
}

export function validateQrPayload(value: string): string {
	const trimmedValue = value.trim();
	parseOtpauthUri(trimmedValue);
	return trimmedValue;
}

export async function parseOtpauthUriFromQrImage(
	blob: Blob,
	dependencies: {
		getImageData?: (blob: Blob) => Promise<QrImageDataLike>;
	} = {},
): Promise<string> {
	const imageData = await (dependencies.getImageData ?? getImageData)(blob);
	return decodeOtpauthUriFromImageData(imageData);
}
