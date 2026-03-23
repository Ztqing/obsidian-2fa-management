import jsQR from "jsqr";
import { createUserError } from "../errors";
import { parseOtpauthUri } from "./otpauth";

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
	const width = image.width;
	const height = image.height;
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

export function validateQrPayload(value: string): string {
	const trimmedValue = value.trim();
	parseOtpauthUri(trimmedValue);
	return trimmedValue;
}

export async function parseOtpauthUriFromQrImage(blob: Blob): Promise<string> {
	const imageData = await getImageData(blob);
	const result = jsQR(imageData.data, imageData.width, imageData.height, {
		inversionAttempts: "attemptBoth",
	});

	if (!result) {
		throw createUserError("qr_not_found");
	}

	return validateQrPayload(result.data);
}
