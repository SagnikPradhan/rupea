import { readFile, writeFile } from 'node:fs/promises';

const BRANCH = /^BRDA:(\d+),(\d+),/gm;

/**
 * Numbers the branch blocks of each line from zero, in the order of their old
 * numbers. Vitest and monocart number a file's blocks in their own order, and
 * Coveralls matches branches by line, block and branch, so without this the
 * same branch in the unit and e2e reports counts twice and its e2e copy looks
 * missed.
 */
export const numberBlocks = (t: string): string =>
	t.split('end_of_record').map(numberFile).join('end_of_record');

const numberFile = (file: string): string => {
	const found = Object.groupBy([...file.matchAll(BRANCH)], (m) => m[1] ?? '');
	const order = Object.fromEntries(
		Object.entries(found).map(([line, m = []]) => [
			line,
			[...new Set(m.map((x) => Number(x[2])))].toSorted((a, b) => a - b),
		]),
	);

	const renumbered = (_: string, l: string, b: string) =>
		`BRDA:${l},${order[l]?.indexOf(Number(b))},`;

	return file.replace(BRANCH, renumbered);
};

const renumber = async (p: string) => writeFile(p, numberBlocks(await readFile(p, 'utf8')));

if (import.meta.main) await Promise.all(process.argv.slice(2).map(renumber));
