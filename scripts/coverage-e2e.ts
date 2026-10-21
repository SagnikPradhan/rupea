import { CoverageReport } from 'monocart-coverage-reports';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

type FileCoverage = {
	statementMap: Record<string, { start: { line: number } }>;
	s: Record<string, number>;
};
type Coverage = Record<string, FileCoverage>;

const RAW = resolve('coverage/e2e-raw');
const E2E = resolve('coverage/e2e');
const UNIT = resolve('coverage/coverage-final.json');

// Sourcemaps name files from wherever the build ran, like ../../src/routes/+layout.svelte.
function inRepo(p: string) {
	return p.includes('src/') ? p.slice(p.indexOf('src/')) : p;
}

const report = new CoverageReport({
	name: 'e2e',
	outputDir: E2E,
	reports: ['json', 'lcovonly'],
	// Only Vite's chunks carry sourcemaps; the files at the top of build/server do not.
	entryFilter: (e) => /\/build\/server\/(chunks|entries|nodes)\/|\/_app\/immutable\//.test(e.url),
	sourceFilter: (p) => !p.includes('node_modules') && existsSync(inRepo(p)),
	sourcePath: inRepo,
	cleanCache: true,
});

// Tiny chunks have no sourcemap, and Playwright now and then reports a chunk without its
// source; another test always has it.
for (const file of await readdir(join(RAW, 'browser'))) {
	const entries: { source?: string }[] = JSON.parse(
		await readFile(join(RAW, 'browser', file), 'utf8'),
	);
	await report.add(entries.filter((e) => e.source?.includes('sourceMappingURL=')));
}
await report.addFromDir(join(RAW, 'server'));
await report.generate();

// A chunk without a sourcemap is reported as itself, so keep only what maps into src.
const lcov = await readFile(join(E2E, 'lcov.info'), 'utf8');
const records = lcov.split('end_of_record\n').filter((r) => /^SF:src\//m.test(r));
await writeFile(join(E2E, 'lcov.info'), records.map((r) => `${r}end_of_record\n`).join(''));

// In CI the unit run is a separate job, and Coveralls merges the two.
if (!existsSync(UNIT)) process.exit(0);

const unit: Coverage = JSON.parse(await readFile(UNIT, 'utf8'));
const e2e: Coverage = JSON.parse(await readFile(join(E2E, 'coverage-final.json'), 'utf8'));

const linesOf = (c: FileCoverage | undefined) => {
	const lines: Record<number, boolean> = {};
	for (const [id, at] of Object.entries(c?.statementMap ?? {}))
		lines[at.start.line] = (lines[at.start.line] ?? false) || (c?.s[id] ?? 0) > 0;
	return lines;
};

const areaOf = (p: string) =>
	['src/routes', 'src/lib/web', 'src/lib/endpoints', 'src/lib/server'].find((a) =>
		p.startsWith(resolve(a)),
	) ?? 'other';

const totals: Record<string, { lines: number; unit: number; e2e: number; both: number }> = {};
for (const [path, c] of Object.entries(unit)) {
	const area = (totals[areaOf(path)] ??= { lines: 0, unit: 0, e2e: 0, both: 0 });
	const seen = linesOf(e2e[path] ?? e2e[relative('.', path)]);
	for (const [line, hit] of Object.entries(linesOf(c))) {
		const ran = seen[Number(line)] ?? false;
		area.lines += 1;
		area.unit += hit ? 1 : 0;
		area.e2e += ran ? 1 : 0;
		area.both += hit || ran ? 1 : 0;
	}
}

totals['total'] = Object.values(totals).reduce(
	(sum, t) => ({
		lines: sum.lines + t.lines,
		unit: sum.unit + t.unit,
		e2e: sum.e2e + t.e2e,
		both: sum.both + t.both,
	}),
	{ lines: 0, unit: 0, e2e: 0, both: 0 },
);

const percent = (n: number, t: number) => `${((100 * n) / t).toFixed(1)}%`;
console.table(
	Object.fromEntries(
		Object.entries(totals).map(([area, t]) => [
			area,
			{
				lines: t.lines,
				unit: percent(t.unit, t.lines),
				e2e: percent(t.e2e, t.lines),
				combined: percent(t.both, t.lines),
			},
		]),
	),
);
