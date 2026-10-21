import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CoverageReportOptions } from 'monocart-coverage-reports';

// Sourcemaps name files from wherever the build ran, like ../../src/routes/+layout.svelte.
const inRepo = (p: string) => (p.includes('src/') ? p.slice(p.indexOf('src/')) : p);

const MAP = /sourceMappingURL=data:application\/json;[^,]*base64,(\S+)/;

// Browser entries carry their source; the server's are read back from build/.
const sourceOf = (e: { url: string; source?: string }) =>
	e.url.startsWith('file:') ? readFileSync(fileURLToPath(e.url), 'utf8') : (e.source ?? '');

// A bundle that maps nothing, like a page of plain markup, would be reported as itself.
const mapsCode = (source: string) => {
	const map = MAP.exec(source)?.[1];
	return map !== undefined && JSON.parse(Buffer.from(map, 'base64').toString()).mappings !== '';
};

/** Maps e2e coverage of the built app back to src, as an lcov for Coveralls. */
export default {
	name: 'e2e',
	outputDir: 'coverage/e2e',
	reports: ['lcovonly'],
	entryFilter: (e) => /\/build\/server\/|\/_app\/immutable\//.test(e.url) && mapsCode(sourceOf(e)),
	sourceFilter: (p) => !p.includes('node_modules') && existsSync(inRepo(p)),
	sourcePath: inRepo,
} satisfies CoverageReportOptions;
