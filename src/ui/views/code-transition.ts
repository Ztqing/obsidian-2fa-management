export type CodeAnimationMode = "none" | "fade" | "slide";

export interface CodeTransitionPlan {
	isFirstRender: boolean;
	shouldAnimateCurrentCode: boolean;
	currentAnimationMode: CodeAnimationMode;
}

export interface CodeTransitionPlanInput {
	previousCurrentCode: string | null;
	nextCurrentCode: string;
	reducedMotion?: boolean;
}

export function getCodeTransitionPlan(
	input: CodeTransitionPlanInput,
): CodeTransitionPlan {
	const isFirstRender = input.previousCurrentCode === null;
	const shouldAnimateCurrentCode =
		input.previousCurrentCode !== null &&
		input.previousCurrentCode !== input.nextCurrentCode;

	return {
		isFirstRender,
		shouldAnimateCurrentCode,
		currentAnimationMode: shouldAnimateCurrentCode
			? input.reducedMotion
				? "fade"
				: "slide"
			: "none",
	};
}
