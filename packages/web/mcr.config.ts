import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CoverageReportOptions } from 'monocart-coverage-reports';

const root = resolve(import.meta.dirname, '../..');

// Sourcemaps name files from wherever the build ran, like ../../src/routes/+layout.svelte.
const inRepo = (p: string) => {
	const at = p.search(/(packages|src)\//);
	if (at < 0) return p;
	return p.startsWith('packages/', at) ? p.slice(at) : `packages/web/${p.slice(at)}`;
};

/**
 * Maps e2e coverage of the built app back to the sources, as an lcov for
 * Coveralls.
 */
export default {
	name: 'e2e',
	outputDir: resolve(root, 'coverage/e2e'),
	reports: ['lcovonly'],
	entryFilter: (e) =>
		/\/build\/server\/|\/packages\/server\/dist\/|\/_app\/immutable\//.test(e.url),
	sourceFilter: (p) => !p.includes('node_modules') && existsSync(resolve(root, inRepo(p))),
	sourcePath: inRepo,
	outputFilter: { 'packages/*/src/**': true },
} satisfies CoverageReportOptions;
