import { defineConfig } from 'vite';

/**
 * The server and its worker are Node entries, built apart from the web app. A
 * build, not a TypeScript loader, since Vite bundles what a loader would miss,
 * such as the built-in schemas `import.meta.glob` reads.
 */
export default defineConfig({
	root: import.meta.dirname,
	build: {
		ssr: true,
		outDir: 'dist',
		emptyOutDir: true,
		copyPublicDir: false,
		// Coverage of the built server, as under mcr, maps back to src through these.
		sourcemap: process.env['NODE_V8_COVERAGE'] ? 'inline' : true,
		rolldownOptions: {
			input: { main: 'src/main.ts', worker: 'src/worker.ts' },
			// Names without a hash, so a watched rebuild replaces the shared chunk and keeps no old ones.
			output: { chunkFileNames: 'assets/[name].js' },
		},
	},
});
