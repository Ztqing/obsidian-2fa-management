import tseslint from "typescript-eslint";
import globals from "globals";
import { globalIgnores } from "eslint/config";

const typedParserOptions = {
	project: ["./tsconfig.json", "./tsconfig.tests.json"],
	tsconfigRootDir: import.meta.dirname,
};

export default tseslint.config(
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parser: tseslint.parser,
			parserOptions: typedParserOptions,
		},
		plugins: {
			"@typescript-eslint": tseslint.plugin,
		},
		rules: {
			"@typescript-eslint/require-await": "error",
		},
	},
	{
		files: ["tests/**/*.ts"],
		languageOptions: {
			globals: {
				...globals.node,
			},
			parser: tseslint.parser,
			parserOptions: typedParserOptions,
		},
	},
	{
		files: ["tests/index.test.mjs", "esbuild.config.mjs", "version-bump.mjs"],
		languageOptions: {
			globals: {
				...globals.node,
			},
			parser: tseslint.parser,
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"versions.json",
		"main.js",
		".test-dist",
	]),
);
