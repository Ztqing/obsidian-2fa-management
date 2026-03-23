function bytesToBinaryString(bytes: Uint8Array): string {
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return binary;
}

function binaryStringToBytes(binary: string): Uint8Array {
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
	return btoa(bytesToBinaryString(bytes));
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
	return bytesToBase64(new Uint8Array(buffer));
}

export function base64ToBytes(value: string): Uint8Array {
	return binaryStringToBytes(atob(value));
}
