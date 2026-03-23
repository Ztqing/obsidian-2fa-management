import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const testsDir = path.dirname(fileURLToPath(import.meta.url));

async function collectTestFiles(directory) {
	const entries = await readdir(directory, {
		withFileTypes: true,
	});
	const testFiles = [];

	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);

		if (entry.isDirectory()) {
			testFiles.push(...(await collectTestFiles(entryPath)));
			continue;
		}

		if (entry.name.endsWith(".test.ts")) {
			testFiles.push(entryPath);
		}
	}

	return testFiles;
}

for (const testFile of (await collectTestFiles(testsDir)).sort()) {
	await jiti.import(pathToFileURL(testFile).href);
}
