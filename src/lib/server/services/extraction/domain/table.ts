/**
 * Turns a recognised table into grid rows: the columns TATR found, filled
 * with the words of the page's text layer. Everything is in one coordinate
 * space; the text, not the image, is what ends up in a cell.
 *
 * Rows come from the text, not from TATR: its row boxes are unreliable on
 * the borderless tables statements use, missing the header above a rule
 * and splitting wrapped cells. A text line is a row, except that a line
 * filling only some of the columns the row above it filled (a narration
 * wrapped onto a second line) is merged into that row.
 */
import { match, P } from 'ts-pattern';
import type { Box, Detection } from '#lib/server/shared/onnx/runtime.ts';
import type { Grid } from './types';

export type Word = Box & { text: string };

type Axis = 'x' | 'y';

/** A row's words, column by column. */
type Row = Word[][];

export const toGrid = (structure: Detection[], words: Word[]): Grid => {
	const columns = bands({ structure, label: 'table column', axis: 'x' });
	if (columns.length === 0) return [];
	return lines(words)
		.map((l) => cells(columns, l))
		.reduce<Row[]>((rows, row) => {
			const above = rows.at(-1);
			match(above)
				.with(
					P.when((a): a is Row => a !== undefined && continues(row, a)),
					(a) => row.forEach((w, c) => a[c]?.push(...w)),
				)
				.otherwise(() => rows.push(row));
			return rows;
		}, [])
		.map((r) => r.map(text));
};

type BandsOptions = {
	structure: Detection[];
	label: string;
	axis: Axis;
};

/**
 * The detections labelled `label` as bands along `axis`, left to right or
 * top to bottom. Where two overlap by more than half the smaller, the
 * likelier wins: DETR sometimes finds one column twice.
 */
const bands = ({ structure, label, axis }: BandsOptions): Box[] =>
	structure
		.filter((d) => d.label === label)
		.sort((a, b) => b.score - a.score)
		.reduce<Box[]>((k, b) => (k.some((o) => overlap(b, o, axis) > 0.5) ? k : [...k, b]), [])
		.sort((a, b) => start(a, axis) - start(b, axis));

/** `line`'s words in the column each is centred in, or nearest to. */
const cells = (columns: Box[], line: Word[]): Row => {
	const row: Row = columns.map(() => []);
	for (const word of line) row[nearest(columns, centre(word, 'x'))]?.push(word);
	return row;
};

const nearest = (columns: Box[], x: number): number => {
	const distances = columns.map((b) => Math.max(b.x1 - x, x - b.x2, 0));
	return distances.indexOf(Math.min(...distances));
};

/** Whether `row` fills fewer than half the columns `above` does, and no others. */
const continues = (row: Row, above: Row) => {
	const filled = row.flatMap((w, c) => (w.length > 0 ? [c] : []));
	const filledAbove = above.filter((w) => w.length > 0).length;
	return filled.every((c) => (above[c]?.length ?? 0) > 0) && filled.length * 2 < filledAbove;
};

/** Words grouped into lines, top to bottom: a word whose centre is within the line's last word. */
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

/** A cell's words in reading order: line by line, left to right. */
const text = (words: Word[]): string =>
	lines(words)
		.map((line) =>
			line
				.sort((a, b) => a.x1 - b.x1)
				.map((w) => w.text)
				.join(' '),
		)
		.join(' ');

/** How much of the smaller of `a` and `b` they share along `axis`. */
const overlap = (a: Box, b: Box, axis: Axis) => {
	const shared = Math.min(end(a, axis), end(b, axis)) - Math.max(start(a, axis), start(b, axis));
	const smaller = Math.min(end(a, axis) - start(a, axis), end(b, axis) - start(b, axis));
	return smaller > 0 ? Math.max(shared, 0) / smaller : 0;
};

const start = (b: Box, a: Axis) => (a === 'x' ? b.x1 : b.y1);
const end = (b: Box, a: Axis) => (a === 'x' ? b.x2 : b.y2);
const centre = (b: Box, a: Axis) => (start(b, a) + end(b, a)) / 2;
