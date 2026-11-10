import adapter from '@sveltejs/adapter-node';
import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				experimental: { async: true },
			},
			experimental: { remoteFunctions: true },
			adapter: adapter(),
		}),
	],
	builder: {},
	server: { watch: { ignored: ['**/.claude/worktrees/**'] } },
	// Coverage of the built app, as under mcr, maps back to src through the source map. Minifying
	// rewrites ternaries and chains into branches the unit run does not have, so they do not merge.
	build: process.env['NODE_V8_COVERAGE']
		? { sourcemap: 'inline', minify: false }
		: { sourcemap: false },
	test: {
		// Reading a PDF runs the models on several threads; a worker per core leaves them none.
		maxWorkers: '50%',
		coverage: {
			include: ['src/**/*.{ts,svelte}', 'packages/{shared,contract,server}/src/**/*.ts'],
			exclude: [
				'src/**/tests/**',
				'packages/*/src/**/tests/**',
				'**/*.d.ts',
				'**/database-schema.ts',
			],
			reporter: ['text', 'html', 'lcov'],
			thresholds: { lines: 90, branches: 80, functions: 90 },
		},
		projects: [
			{
				extends: true,
				test: {
					name: 'backend',
					include: [
						'packages/server/src/services/*/tests/*.test.ts',
						'packages/server/src/tests/*.test.ts',
						'tests/shared/**/*.test.ts',
						'src/lib/endpoints/tests/*.test.ts',
					],
					benchmark: { include: ['packages/server/src/**/tests/*.bench.ts'] },
					environment: 'node',
					globalSetup: ['packages/server/tests/shared/postgres.ts'],
				},
			},
			{
				extends: true,
				test: { name: 'shared', include: ['packages/shared/tests/*.test.ts'], environment: 'node' },
			},
			{
				extends: true,
				test: {
					name: 'contract',
					include: ['packages/contract/tests/*.test.ts'],
					environment: 'node',
				},
			},
			{
				extends: true,
				test: { name: 'lint', include: ['lint/tests/*.test.ts'], environment: 'node' },
			},
			{
				// Components render in a DOM; `svelteTesting` resolves Svelte's browser build.
				extends: true,
				plugins: [svelteTesting()],
				test: {
					name: 'frontend',
					include: ['src/lib/web/tests/*.test.ts'],
					benchmark: { include: ['src/lib/web/tests/*.bench.ts'] },
					environment: 'happy-dom',
					// Creates the DOM once per worker, not per file. Sharing it with isolate: false lets one file's URL leak into the next.
					pool: 'vmThreads',
				},
			},
		],
	},
});
