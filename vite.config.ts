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
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'server',
					include: ['src/**/*.test.ts', 'tests/shared/**/*.test.ts'],
					exclude: ['src/**/*.dom.test.ts'],
					environment: 'node',
				},
			},
			{
				// Components render in a DOM; `svelteTesting` resolves Svelte's browser build.
				extends: true,
				plugins: [svelteTesting()],
				test: {
					name: 'dom',
					include: ['src/**/*.dom.test.ts'],
					environment: 'happy-dom',
				},
			},
		],
	},
});
