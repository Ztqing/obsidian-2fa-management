import { createUserError } from "../errors";

export async function copyTextToClipboard(text: string): Promise<void> {
	if (!navigator.clipboard?.writeText) {
		throw createUserError("clipboard_unavailable");
	}

	try {
		await navigator.clipboard.writeText(text);
	} catch {
		throw createUserError("clipboard_unavailable");
	}
}
