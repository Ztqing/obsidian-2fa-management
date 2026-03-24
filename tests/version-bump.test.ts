import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = path.resolve(process.cwd(), "version-bump.mjs");

test("version-bump script always writes the current version mapping", async () => {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "twofa-version-bump-"));

	await writeFile(
		path.join(tempDir, "manifest.json"),
		JSON.stringify(
			{
				id: "2fa-management",
				version: "1.0.0",
				minAppVersion: "1.8.7",
			},
			null,
			"\t",
		),
	);
	await writeFile(
		path.join(tempDir, "versions.json"),
		JSON.stringify(
			{
				"1.0.0": "1.8.7",
			},
			null,
			"\t",
		),
	);

	const result = spawnSync(process.execPath, [scriptPath], {
		cwd: tempDir,
		encoding: "utf8",
		env: {
			...process.env,
			npm_package_version: "1.0.1",
		},
	});

	assert.equal(result.status, 0, result.stderr);

	const manifest = JSON.parse(
		await readFile(path.join(tempDir, "manifest.json"), "utf8"),
	) as {
		minAppVersion: string;
		version: string;
	};
	const versions = JSON.parse(
		await readFile(path.join(tempDir, "versions.json"), "utf8"),
	) as Record<string, string>;

	assert.equal(manifest.version, "1.0.1");
	assert.deepEqual(versions, {
		"1.0.0": "1.8.7",
		"1.0.1": "1.8.7",
	});
});
