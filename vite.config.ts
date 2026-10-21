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
		{
			// SvelteKit builds only its own environments.
			name: 'rupee:worker',
			buildApp: {
				order: 'post',
				handler: async (b) => {
					const worker = b.environments['worker'];
					if (worker) await b.build(worker);
				},
			},
		},
	],
	builder: {},
	// E2E coverage maps the built code back to src.
	build: { sourcemap: process.env['E2E_COVERAGE'] ? 'inline' : false },
	environments: {
		worker: {
			consumer: 'server',
			build: {
				outDir: 'build/worker',
				emptyOutDir: true,
				copyPublicDir: false,
				rolldownOptions: { input: { worker: 'src/worker.ts' } },
			},
		},
	},
	test: {
		// Reading a PDF runs the models on several threads; a worker per core leaves them none.
		maxWorkers: '50%',
		coverage: {
			include: ['src/**/*.{ts,svelte}'],
			exclude: ['src/**/tests/**', 'src/**/*.d.ts'],
			reporter: ['text', 'html', 'lcov'],
		},
		projects: [
			{
				extends: true,
				test: {
					name: 'backend',
					include: [
						'src/lib/server/**/tests/*.test.ts',
						'src/lib/endpoints/tests/*.test.ts',
						'tests/shared/**/*.test.ts',
					],
					environment: 'node',
					globalSetup: ['tests/shared/postgres.ts'],
				},
			},
			{
				// Components render in a DOM; `svelteTesting` resolves Svelte's browser build.
				extends: true,
				plugins: [svelteTesting()],
				test: {
					name: 'frontend',
					include: ['src/lib/web/**/tests/*.test.ts'],
					environment: 'happy-dom',
				},
			},
		],
	},
});
