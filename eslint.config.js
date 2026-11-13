import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import functional from 'eslint-plugin-functional';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import { functionNames } from './lint/function-names.ts';
import { localNameLength } from './lint/local-name-length.ts';
import { packageBoundaries } from './lint/package-boundaries.ts';
import { testLocation } from './lint/test-location.ts';

const webMayImportServer = ['packages/web/tests/e2e/support/*.ts'];

const rupea = {
	rules: {
		'function-names': functionNames,
		'local-name-length': localNameLength,
		'package-boundaries': packageBoundaries,
		'test-location': testLocation,
	},
};

export default defineConfig(
	globalIgnores([
		'data/',
		'packages/web/build/',
		'packages/web/.svelte-kit/',
		'drizzle/',
		'coverage/',
		'.claude/',
		'packages/site/dist/',
		'packages/server/dist/',
		'packages/site/.astro/',
	]),
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
		ignores: ['**/*.test.ts', 'packages/*/tests/**'],
	},
	{
		files: ['packages/server/src/api/**/*.ts'],
		rules: { 'functional/no-throw-statements': 'off' },
	},
	{
		files: ['**/*.ts'],
		plugins: { rupea },
		rules: {
			'rupea/local-name-length': 'error',
			'rupea/function-names': [
				'warn',
				{ allow: ['sum', 'min', 'max', 'multiply', 'divide', 'negate', 'round'] },
			],
		},
		ignores: ['**/*.test.ts', 'packages/*/tests/**'],
	},
	{
		files: ['**/*.ts'],
		ignores: ['packages/server/src/shared/result/result.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					name: 'neverthrow',
					message:
						'Import from @rupea/server/shared/result/result.ts, or #lib/server/shared/result/result.ts in the server; fault builds errors.',
				},
			],
		},
	},
	{
		files: ['**/*.ts', '**/*.svelte'],
		ignores: [
			'packages/server/src/services/ledger/**',
			'packages/server/src/shared/result/result.ts',
			'packages/server/src/server.ts',
			'packages/server/src/db/tables.ts',
			'packages/server/src/services/*/adapters/database-schema.ts',
			'packages/server/scripts/**',
		],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'neverthrow',
							message:
								'Import from @rupea/server/shared/result/result.ts, or #lib/server/shared/result/result.ts in the server; fault builds errors.',
						},
					],
					patterns: [
						{
							group: [
								'\\#services/ledger/domain/*',
								'\\#services/ledger/adapters/*',
								'@rupea/server/services/ledger/domain/*',
								'@rupea/server/services/ledger/adapters/*',
							],
							message:
								'Import from #services/ledger/application/language.ts, or an application module; the ledger keeps its domain and adapters to itself.',
						},
					],
				},
			],
		},
	},
	{
		files: ['**/*.ts', '**/*.svelte'],
		plugins: { rupea },
		rules: { 'rupea/package-boundaries': 'error' },
	},
	{
		files: webMayImportServer,
		rules: { 'rupea/package-boundaries': ['error', { allowServer: true }] },
	},
	{
		files: ['packages/*/src/**/*.test.ts'],
		plugins: { rupea },
		rules: { 'rupea/test-location': 'error' },
	},
);
