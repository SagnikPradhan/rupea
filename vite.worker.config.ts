import { defineConfig } from 'vite';

/** The worker is a Node entry of its own, built apart from SvelteKit: once by `vite build`, and watched by `vite dev`. */
export default defineConfig({
	build: {
		ssr: true,
		outDir: 'build/worker',
		emptyOutDir: true,
		copyPublicDir: false,
		// Coverage of the built app, as under mcr, maps back to src through these.
		sourcemap: process.env['NODE_V8_COVERAGE'] ? 'inline' : false,
		rolldownOptions: { input: { worker: 'src/worker.ts' } },
	},
});
