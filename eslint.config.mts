import tseslint from "typescript-eslint";
import globals from "globals";
import { globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

const typedParserOptions = {
	project: ["./tsconfig.json", "./tsconfig.tests.json"],
	tsconfigRootDir: import.meta.dirname,
};

export default tseslint.config(
	...obsidianmd.configs.recommended,
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
			"@typescript-eslint/no-deprecated": "error",
			"@typescript-eslint/no-duplicate-type-constituents": "error",
			"@typescript-eslint/no-empty-object-type": "error",
			"@typescript-eslint/no-unused-vars": "error",
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
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-floating-promises": "off",
			"@typescript-eslint/no-unnecessary-type-assertion": "off",
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
