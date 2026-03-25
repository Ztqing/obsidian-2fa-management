import type { GuardedActionEnvironment } from "./contracts";

export async function executeGuardedAction(
	environment: GuardedActionEnvironment,
	task: () => Promise<unknown>,
): Promise<boolean> {
	try {
		await task();
		return true;
	} catch (error) {
		const message = environment.getErrorMessage(error);
		if (environment.showNotice) {
			environment.showNotice(message);
		} else {
			console.error(error);
		}
		return false;
	}
}

export async function runGuardedAction(
	environment: GuardedActionEnvironment,
	task: () => Promise<unknown>,
	options: {
		onError?: () => void;
	} = {},
): Promise<boolean> {
	const didSucceed = await executeGuardedAction(environment, task);
	if (!didSucceed) {
		options.onError?.();
	}
	return didSucceed;
}

export class ActionRunner {
	constructor(private readonly environment: GuardedActionEnvironment) {}

	runVoid(task: () => Promise<void>): Promise<boolean> {
		return executeGuardedAction(this.environment, task);
	}
}
