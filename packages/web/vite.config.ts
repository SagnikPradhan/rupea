import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	root: import.meta.dirname,
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: (x) => (x.filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
				experimental: { async: true },
			},
			experimental: { remoteFunctions: true },
			adapter: adapter(),
		}),
	],
	builder: {},
	server: { watch: { ignored: ['**/.claude/worktrees/**'] } },
	build: process.env['NODE_V8_COVERAGE'] ? { sourcemap: 'inline', minify: false } : {},
	test: {
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
				extends: true,
				plugins: [svelteTesting()],
				test: {
					name: 'frontend',
					include: ['src/lib/web/tests/*.test.ts'],
					benchmark: { include: ['src/lib/web/tests/*.bench.ts'] },
					environment: 'happy-dom',
					pool: 'vmThreads',
				},
			},
		],
	},
});
