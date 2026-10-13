import { match, P } from 'ts-pattern';
import type { Box, Detection } from '#lib/server/shared/onnx/runtime.ts';
import type { Grid } from './types';

export type Word = Box & { text: string };

type Axis = 'x' | 'y';

type Row = Word[][];

// Rows come from the text layer, not TATR: its row boxes miss headers above
// rules and split wrapped cells on borderless statement tables.
export const toGrid = (structure: Detection[], words: Word[]): Grid => {
	const found = bands({ structure, label: 'table column', axis: 'x' });
	if (found.length === 0) return [];

	const columns = joined(found, lines(words));

	return lines(words)
		.map((l) => cells(columns, l))
		.reduce<Row[]>((rows, row, i, all) => {
			const target = [rows.at(-1), all[i + 1]]
				.filter((r): r is Row => r !== undefined && continues(row, r))
				.sort((a, b) => gap(row, a) - gap(row, b))
				.at(0);
			if (target === undefined) return [...rows, row];

			row.forEach((w, c) => target[c]?.push(...w));
			return rows;
		}, [])
		.map((r) => r.map(text));
};

// The detector sometimes stops short of a table's first or last column, cutting
// through its words; a table's edge never runs through one.
export const widen = (box: Box, words: Word[]): Box => {
	const beside = words.filter((w) => centre(w, 'y') >= box.y1 && centre(w, 'y') <= box.y2);
	const cut = (x: number) => beside.filter((w) => w.x1 < x && w.x2 > x);

	const x1 = Math.min(box.x1, ...cut(box.x1).map((w) => w.x1));
	const x2 = Math.max(box.x2, ...cut(box.x2).map((w) => w.x2));
	return x1 === box.x1 && x2 === box.x2 ? box : widen({ ...box, x1, x2 }, words);
};

type BandsOptions = {
	structure: Detection[];
	label: string;
	axis: Axis;
};

// DETR sometimes finds one column twice; of two overlapping, the likelier wins.
const bands = ({ structure, label, axis }: BandsOptions): Box[] =>
	structure
		.filter((d) => d.label === label)
		.sort((a, b) => b.score - a.score)
		.reduce<Box[]>((k, b) => (k.some((o) => overlap(b, o, axis) > 0.5) ? k : [...k, b]), [])
		.sort((a, b) => start(a, axis) - start(b, axis));

// TATR sometimes splits one column in two. Text that more lines run
// across a boundary than keep apart on either side means it isn't one.
const joined = (columns: Box[], lines: Word[][]): Box[] =>
	columns.reduce<Box[]>((kept, column) => {
		const left = kept.at(-1);
		if (left === undefined || apart(left, column, lines)) return [...kept, column];

		return [...kept.slice(0, -1), { ...left, x2: column.x2 }];
	}, []);

const apart = (left: Box, right: Box, lines: Word[][]) => {
	const across = (l: Word[]) => l.some((w) => w.x1 < left.x2 && w.x2 > right.x1);
	const within = (l: Word[], b: Box) =>
		l.some((w) => centre(w, 'x') >= b.x1 && centre(w, 'x') <= b.x2);

	const crossing = lines.filter(across).length;
	const separate = lines.filter((l) => !across(l) && (within(l, left) || within(l, right))).length;
	return crossing <= separate;
};

const cells = (columns: Box[], line: Word[]): Row => {
	const row: Row = columns.map(() => []);
	for (const word of line) row[nearest(columns, centre(word, 'x'))]?.push(word);
	return row;
};

const nearest = (columns: Box[], x: number): number => {
	const distances = columns.map((b) => Math.max(b.x1 - x, x - b.x2, 0));
	return distances.indexOf(Math.min(...distances));
};

// A cell wrapped around a vertically centred row starts above it, and may
// leave the row's own line empty, so a sparse line joins whichever fuller
// neighbour sits within its line spacing.
const continues = (row: Row, other: Row) => {
	const filled = row.filter((w) => w.length > 0).length;
	const filledOther = other.filter((w) => w.length > 0).length;

	const own = extent(row);
	return filled * 2 < filledOther && gap(row, other) < (own.y2 - own.y1) / 2;
};

const gap = (a: Row, b: Row) => {
	const [first, second] = [extent(a), extent(b)];
	return Math.max(second.y1 - first.y2, first.y1 - second.y2);
};

const extent = (row: Row) => {
	const words = row.flat();
	return { y1: Math.min(...words.map((w) => w.y1)), y2: Math.max(...words.map((w) => w.y2)) };
};

const lines = (words: Word[]): Word[][] =>
	[...words]
		.sort((a, b) => centre(a, 'y') - centre(b, 'y'))
		.reduce<Word[][]>((lines, word) => {
			const line = lines.at(-1);
			const last = line?.at(-1);
			const same = last !== undefined && centre(word, 'y') <= last.y2;
			match(line)
				.with(
					P.when((l): l is Word[] => l !== undefined && same),
					(l) => l.push(word),
				)
				.otherwise(() => lines.push([word]));
			return lines;
		}, []);

const text = (words: Word[]): string =>
	lines(words)
		.map((line) =>
			line
				.sort((a, b) => a.x1 - b.x1)
				.map((w) => w.text)
				.join(' '),
		)
		.join(' ');

const overlap = (a: Box, b: Box, axis: Axis) => {
	const shared = Math.min(end(a, axis), end(b, axis)) - Math.max(start(a, axis), start(b, axis));
	const smaller = Math.min(end(a, axis) - start(a, axis), end(b, axis) - start(b, axis));
	return smaller > 0 ? Math.max(shared, 0) / smaller : 0;
};

const start = (b: Box, a: Axis) => (a === 'x' ? b.x1 : b.y1);
const end = (b: Box, a: Axis) => (a === 'x' ? b.x2 : b.y2);
const centre = (b: Box, a: Axis) => (start(b, a) + end(b, a)) / 2;
