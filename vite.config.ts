import adapter from '@sveltejs/adapter-node';
import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { build } from 'vite';
import { defineConfig } from 'vitest/config';

const WORKER = 'vite.worker.config.ts';

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
			// Workers run a build in dev too, as they are processes of their own that Vite does not serve.
			name: 'rupee:worker',
			buildApp: {
				order: 'post',
				handler: () => build({ configFile: WORKER }).then(() => undefined),
			},
			configureServer: async (server) => {
				if (process.env['VITEST']) return;

				const watcher = await build({
					configFile: WORKER,
					mode: 'development',
					build: { outDir: '.svelte-kit/worker', sourcemap: true, watch: {} },
				});
				if (!('on' in watcher)) return;

				watcher.on('event', async (e) => {
					if (e.code === 'BUNDLE_END' || e.code === 'ERROR') await e.result.close();
					if (e.code === 'BUNDLE_END')
						server.environments.ssr.hot.send({ type: 'custom', event: 'rupee:worker-built' });
					if (e.code === 'ERROR') server.config.logger.error(`worker build: ${e.error.message}`);
				});
				server.httpServer?.once('close', () => void watcher.close());
			},
		},
	],
	builder: {},
	// Coverage of the built app, as under mcr, maps back to src through these.
	build: { sourcemap: process.env['NODE_V8_COVERAGE'] ? 'inline' : false },
	test: {
		// Reading a PDF runs the models on several threads; a worker per core leaves them none.
		maxWorkers: '50%',
		coverage: {
			include: ['src/**/*.{ts,svelte}'],
			exclude: ['src/**/tests/**', 'src/**/*.d.ts', 'src/**/database-schema.ts'],
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
						'src/lib/shared/tests/*.test.ts',
						'tests/shared/**/*.test.ts',
					],
					benchmark: { include: ['src/lib/server/**/tests/*.bench.ts'] },
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
					benchmark: { include: [] },
					environment: 'happy-dom',
				},
			},
		],
	},
});
