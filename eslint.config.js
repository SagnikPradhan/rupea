import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import functional from 'eslint-plugin-functional';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import { localNameLength } from './lint/local-name-length.ts';
import { testLocation } from './lint/test-location.ts';

const rupee = { rules: { 'local-name-length': localNameLength, 'test-location': testLocation } };

export default defineConfig(
	globalIgnores(['build/', 'data/', '.svelte-kit/', 'drizzle/', 'coverage/']),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: { parserOptions: { parser: ts.parser } },
	},
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			curly: ['error', 'multi'],
			'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }],
			'no-restricted-syntax': [
				'error',
				{
					selector: 'IfStatement > IfStatement.alternate',
					message: 'Do not use else if.',
				},
			],
		},
	},
	{
		...functional.configs.noOtherParadigms,
		files: ['**/*.ts'],
		rules: {
			...functional.configs.noOtherParadigms.rules,
			'functional/no-let': 'error',
			'functional/no-mixed-types': 'off',
		},
	},
	{
		...functional.configs.noExceptions,
		files: ['**/*.ts'],
		ignores: ['**/*.test.ts', 'tests/**'],
	},
	{
		files: ['**/*.ts'],
		plugins: { rupee },
		rules: { 'rupee/local-name-length': 'error' },
		ignores: ['**/*.test.ts', 'tests/**'],
	},
	{
		files: ['**/*.ts'],
		ignores: ['src/lib/server/shared/result/result.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					name: 'neverthrow',
					message: 'Import from #lib/server/shared/result/result.ts; fault builds errors.',
				},
			],
		},
	},
	{
		files: ['src/**/*.test.ts'],
		plugins: { rupee },
		rules: { 'rupee/test-location': 'error' },
	},
);
