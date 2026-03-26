const CODE_ROLL_DURATION_MS = 220;
const CODE_ROLL_STAGGER_MS = 18;

export type CodeAnimationMode = "none" | "roll";

export interface CodeTransitionSegment {
	delayMs: number;
	index: number;
	nextCharacter: string;
	previousCharacter: string;
	shouldAnimate: boolean;
}

export interface CodeTransitionPlan {
	segments: CodeTransitionSegment[];
	isFirstRender: boolean;
	shouldAnimateCurrentCode: boolean;
	currentAnimationMode: CodeAnimationMode;
	totalDurationMs: number;
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
	const segments = createCodeTransitionSegments(
		input.previousCurrentCode,
		input.nextCurrentCode,
		shouldAnimateCurrentCode && !input.reducedMotion,
	);
	const totalDurationMs = getCodeTransitionDurationMs(segments);

	return {
		segments,
		isFirstRender,
		shouldAnimateCurrentCode,
		currentAnimationMode: shouldAnimateCurrentCode
			? input.reducedMotion
				? "none"
				: "roll"
			: "none",
		totalDurationMs,
	};
}

function createCodeTransitionSegments(
	previousCurrentCode: string | null,
	nextCurrentCode: string,
	allowAnimation: boolean,
): CodeTransitionSegment[] {
	const previousCharacters = [...(previousCurrentCode ?? "")];
	const nextCharacters = [...nextCurrentCode];
	let animatedCharacterCount = 0;

	return nextCharacters.map((nextCharacter, index) => {
		const previousCharacter = previousCharacters[index] ?? "";
		const shouldAnimate = allowAnimation && previousCharacter !== nextCharacter;
		const delayMs = shouldAnimate
			? animatedCharacterCount++ * CODE_ROLL_STAGGER_MS
			: 0;

		return {
			delayMs,
			index,
			nextCharacter,
			previousCharacter,
			shouldAnimate,
		};
	});
}

function getCodeTransitionDurationMs(
	segments: readonly CodeTransitionSegment[],
): number {
	const latestAnimatedSegment = [...segments]
		.reverse()
		.find((segment) => segment.shouldAnimate);

	if (!latestAnimatedSegment) {
		return 0;
	}

	return CODE_ROLL_DURATION_MS + latestAnimatedSegment.delayMs;
}
