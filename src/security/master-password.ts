export const MIN_MASTER_PASSWORD_LENGTH = 6;

export type MasterPasswordValidationIssue = "empty" | "mismatch" | "too_short";

export function validateMasterPasswordInput(
	password: string,
	options: {
		confirmation?: string;
		minimumLength?: number;
		requireConfirmation?: boolean;
	} = {},
): MasterPasswordValidationIssue | null {
	if (password.length === 0) {
		return "empty";
	}

	if (
		typeof options.minimumLength === "number" &&
		password.length < options.minimumLength
	) {
		return "too_short";
	}

	if (
		options.requireConfirmation &&
		password !== (options.confirmation ?? "")
	) {
		return "mismatch";
	}

	return null;
}
