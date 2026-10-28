import { existsSync } from 'node:fs';
import type { CoverageReportOptions } from 'monocart-coverage-reports';

// Sourcemaps name files from wherever the build ran, like ../../src/routes/+layout.svelte.
const inRepo = (p: string) => (p.includes('src/') ? p.slice(p.indexOf('src/')) : p);

/** Maps e2e coverage of the built app back to src, as an lcov for Coveralls. */
export default {
	name: 'e2e',
	outputDir: 'coverage/e2e',
	reports: ['lcovonly'],
	entryFilter: (e) => /\/build\/server\/|\/_app\/immutable\//.test(e.url),
	sourceFilter: (p) => !p.includes('node_modules') && existsSync(inRepo(p)),
	sourcePath: inRepo,
	outputFilter: 'src/**',
} satisfies CoverageReportOptions;
