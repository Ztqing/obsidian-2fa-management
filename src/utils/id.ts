export function createRandomId(): string {
	if (globalThis.crypto?.randomUUID) {
		return globalThis.crypto.randomUUID();
	}

	const randomBytes = new Uint8Array(16);
	globalThis.crypto.getRandomValues(randomBytes);

	randomBytes[6] = ((randomBytes[6] ?? 0) & 0x0f) | 0x40;
	randomBytes[8] = ((randomBytes[8] ?? 0) & 0x3f) | 0x80;

	const hex = Array.from(randomBytes, (byte) =>
		byte.toString(16).padStart(2, "0"),
	);

	return [
		hex.slice(0, 4).join(""),
		hex.slice(4, 6).join(""),
		hex.slice(6, 8).join(""),
		hex.slice(8, 10).join(""),
		hex.slice(10, 16).join(""),
	].join("-");
}
