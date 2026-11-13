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
		maxWorkers: '50%',
		coverage: {
			include: ['src/**/*.{ts,svelte}'],
			exclude: ['src/**/tests/**', '**/*.d.ts'],
			reporter: ['text', 'html', 'lcov'],
			reportsDirectory: '../../coverage/web',
			thresholds: { lines: 90, branches: 80, functions: 90 },
		},
		projects: [
			{
				extends: true,
				test: {
					name: 'endpoints',
					include: ['src/lib/endpoints/tests/*.test.ts'],
					environment: 'node',
				},
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
