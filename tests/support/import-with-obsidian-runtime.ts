import { createJiti } from "jiti";

const obsidianRuntimePath = new URL("./obsidian-runtime.ts", import.meta.url).pathname;
const repoRoot = new URL("../../", import.meta.url);

const jiti = createJiti(import.meta.url, {
	alias: {
		obsidian: obsidianRuntimePath,
	},
});

export async function importWithObsidianRuntime<T>(
	modulePath: string,
): Promise<T> {
	const resolvedModulePath = new URL(modulePath.replace(/^\.\//, ""), repoRoot).pathname;
	return (await jiti.import(resolvedModulePath)) as T;
}
