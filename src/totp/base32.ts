import { createUserError } from "../errors";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function sanitizeBase32Secret(secret: string): string {
	return secret
		.toUpperCase()
		.replace(/[\s-]/g, "")
		.replace(/=+$/u, "");
}

export function decodeBase32Secret(secret: string): Uint8Array {
	const normalizedSecret = sanitizeBase32Secret(secret);

	if (normalizedSecret.length === 0) {
		throw createUserError("secret_required");
	}

	let buffer = 0;
	let bitsLeft = 0;
	const output: number[] = [];

	for (const character of normalizedSecret) {
		const alphabetIndex = BASE32_ALPHABET.indexOf(character);

		if (alphabetIndex === -1) {
			throw createUserError("secret_invalid_base32");
		}

		buffer = (buffer << 5) | alphabetIndex;
		bitsLeft += 5;

		if (bitsLeft >= 8) {
			bitsLeft -= 8;
			output.push((buffer >>> bitsLeft) & 0xff);
		}
	}

	if (output.length === 0) {
		throw createUserError("secret_base32_too_short");
	}

	return new Uint8Array(output);
}
