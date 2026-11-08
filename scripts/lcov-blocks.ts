import { readFile, writeFile } from 'node:fs/promises';

const BRANCH = /^BRDA:(\d+),(\d+),/gm;

/**
 * Numbers the branch blocks of each line from zero in both reports, where the
 * two see the same arms on that line. Vitest and monocart number a file's
 * blocks in their own order, and Coveralls matches branches by line, block and
 * branch, so otherwise the same branch counts twice and its e2e copy looks
 * missed. A line where the blocks differ, as the minified build can make them,
 * keeps its numbers, since pairing it would credit an arm with another's hits.
 */
export const numberBlocks = (unit: string, e2e: string): [string, string] => [
	numberAgainst(unit, e2e),
	numberAgainst(e2e, unit),
];

const numberAgainst = (lcov: string, other: string): string => {
	const theirs = filesOf(other);
	return Object.entries(filesOf(lcov))
		.map(([path, file]) => numberFile(file, theirs[path] ?? ''))
		.join('');
};

const filesOf = (lcov: string): Record<string, string> =>
	Object.fromEntries(
		lcov
			.split(/(?<=end_of_record\n)/)
			.filter((f) => f !== '')
			.map((f) => [/^SF:(.*)$/m.exec(f)?.[1] ?? '', f]),
	);

const numberFile = (file: string, other: string): string => {
	const mine = armsOf(file);
	const theirs = armsOf(other);
	const agreed = (l: string) =>
		Object.values(mine[l] ?? {}).join() === Object.values(theirs[l] ?? {}).join();

	return file.replace(BRANCH, (all, line: string, block: string) => {
		if (!agreed(line)) return all;
		return `BRDA:${line},${Object.keys(mine[line] ?? {}).indexOf(block)},`;
	});
};

/**
 * How many arms each block of each line has. Integer keys come back in
 * ascending order, which is the order the blocks are numbered in.
 */
const armsOf = (file: string): Record<string, Record<string, number>> => {
	const lines = Object.groupBy([...file.matchAll(BRANCH)], (m) => m[1] ?? '');
	return Object.fromEntries(
		Object.entries(lines).map(([line, m = []]) => {
			const blocks = Object.groupBy(m, (x) => x[2] ?? '');
			return [line, Object.fromEntries(Object.entries(blocks).map(([b, x = []]) => [b, x.length]))];
		}),
	);
};

if (import.meta.main) {
	const [unit = '', e2e = ''] = process.argv.slice(2);
	const [numbered, other] = numberBlocks(await readFile(unit, 'utf8'), await readFile(e2e, 'utf8'));
	await Promise.all([writeFile(unit, numbered), writeFile(e2e, other)]);
}
