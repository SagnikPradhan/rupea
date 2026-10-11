import { displayLocation, parseAmount, parseDate } from '#services/ledger/domain/parser.ts';
import type { Amount } from '#services/ledger/domain/types.ts';
import { batch, err, ok, type Batch, type Result } from '#lib/server/shared/result.ts';
import { match, P } from 'ts-pattern';
import type { Locator, Path, RupeeSchema, Transform } from './schema';
import { STATEMENT_ERA, type Grid, type RupeeRecord } from './types';

type Sheet = { file: string; grid: Grid; headers: Map<string, number> };

// `lost` once a search finds nothing, so later offsets cannot land on a cell.
type Cursor = { col: number | null; row: number; lost: boolean };

type Read =
	| { kind: 'text'; text: string }
	| { kind: 'amount'; amount: Amount }
	| { kind: 'date'; date: Temporal.PlainDate }
	| { kind: 'missing' }
	| { kind: 'failed'; reason: string };

type ExtractOptions = {
	schema: RupeeSchema;
	file: string;
	grid: Grid;
};

export const extract = (options: ExtractOptions): Result<Batch<RupeeRecord>> => {
	const { schema, file, grid } = options;
	const header = grid.findIndex((c) =>
		schema.header ? c.some((l) => isHeader(schema.header, l)) : !isBlank(c),
	);
	if (header < 0) return err({ type: 'ExtractionMissingHeader', path: file, cause: [] });

	const names = (grid[header] ?? []).map((c, i): [string, number] => [c.trim(), i]);
	// Reversed so that the first of two same-named columns wins.
	const sheet: Sheet = { file, grid, headers: new Map(names.reverse()) };
	const missing = columns(schema).filter((n) => column(sheet, n) === null);
	if (missing.length > 0)
		return err({
			type: 'ExtractionMissingColumns',
			path: file,
			columns: missing,
			cause: [],
		});

	// A statement may repeat its header, as on every page of a PDF.
	const repeats = (c: string[]) => c.join('\t').trim() === (grid[header] ?? []).join('\t').trim();
	return ok(
		batch(
			grid.flatMap((cs, r) =>
				r > header && !isBlank(cs) && !repeats(cs) && keeps({ schema, sheet, row: r })
					? [record({ schema, sheet, row: r })]
					: [],
			),
		),
	);
};

const isBlank = (c: string[]) => c.every((c) => c.trim() === '');

const isHeader = (h: RupeeSchema['header'], c: string) =>
	h !== undefined && ('text' in h ? c.trim() === h.text : h.regex.test(c));

const columns = ({ fields, records }: RupeeSchema): string[] => {
	const paths = Object.values(fields).flatMap((p) => p ?? []);
	const headers = paths
		.flatMap(({ from }) => from)
		.flatMap((l) => ('header' in l ? [l.header] : []));
	const where = records.where ? [records.where.col] : [];
	return [...new Set([...headers, ...where])];
};

const column = ({ headers }: Sheet, nm: string): number | null =>
	headers.get(nm) ??
	(/^[A-Z]+$/.test(nm) ? [...nm].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0) - 1 : null);

type RowOptions = {
	schema: RupeeSchema;
	sheet: Sheet;
	row: number;
};

const keeps = ({ schema, sheet, row }: RowOptions) => {
	const records = schema.records;
	if (!records.where) return true;
	const col = column(sheet, records.where.col);
	const cell = col === null ? undefined : sheet.grid[row]?.[col];
	return cell !== undefined && records.where.matches.test(cell);
};

type InvalidOptions = {
	field: string;
	read: Read;
	expected: string;
};

const record = ({ schema, sheet, row }: RowOptions): Result<RupeeRecord> => {
	const fields = schema.fields;
	const location = { file: sheet.file, line: row + 1 };

	const get = (p: Path[], k: Read['kind']) => readField({ sheet, row, paths: p, kind: k });
	const invalid = ({ field, read, expected }: InvalidOptions): Result<RupeeRecord> =>
		err({
			type: 'ExtractionInvalidField',
			location: displayLocation(location),
			field,
			reason: reason(read, expected),
			cause: [],
		});

	const date = get(fields.date, 'date');
	if (date.kind !== 'date') return invalid({ field: 'date', read: date, expected: 'a date' });

	const amount = get(fields.amount, 'amount');
	if (amount.kind !== 'amount')
		return invalid({ field: 'amount', read: amount, expected: 'an amount' });

	const description = get(fields.description, 'text');
	if (description.kind !== 'text')
		return invalid({ field: 'description', read: description, expected: 'text' });

	const category = get(fields.category ?? [], 'text');
	if (category.kind !== 'text' && category.kind !== 'missing')
		return invalid({ field: 'category', read: category, expected: 'text' });

	const balance = get(fields.balance ?? [], 'amount');
	if (balance.kind !== 'amount' && balance.kind !== 'missing')
		return invalid({ field: 'balance', read: balance, expected: 'an amount' });

	return ok({
		location,
		date: date.date,
		amount: amount.amount,
		description: description.text,
		category: category.kind === 'text' ? category.text : null,
		balance: balance.kind === 'amount' ? balance.amount : null,
	});
};

type ReadFieldOptions = {
	sheet: Sheet;
	row: number;
	paths: Path[];
	kind: Read['kind'];
};

const readField = (options: ReadFieldOptions): Read => {
	const { sheet, row, paths, kind } = options;
	const reads = paths.map((p) => readPath({ sheet, row, path: p }));
	return (
		reads.find((r) => r.kind === kind) ??
		reads.find((r) => r.kind !== 'missing') ?? { kind: 'missing' }
	);
};

type ReadPathOptions = {
	sheet: Sheet;
	row: number;
	path: Path;
};

const readPath = ({ sheet, row, path: { from, pipe } }: ReadPathOptions): Read => {
	const { col, row: at, lost } = from.reduce(move(sheet), { col: null, row, lost: false });
	const cell = col === null || lost ? undefined : sheet.grid[at]?.[col];
	if (cell === undefined || cell.trim() === '') return { kind: 'missing' };
	return pipe.reduce(apply, { kind: 'text', text: cell });
};

const move =
	(sheet: Sheet) =>
	(c: Cursor, l: Locator): Cursor => {
		const find = (match: (cell: string) => boolean) => {
			const col = (sheet.grid[c.row] ?? []).findIndex(match);
			return col < 0 ? { ...c, lost: true } : { ...c, col };
		};
		return match(l)
			.with({ col: P.select() }, (n) => ({ ...c, col: column(sheet, n) }))
			.with({ header: P.select() }, (h) => ({ ...c, col: sheet.headers.get(h) ?? null }))
			.with({ text: P.select() }, (t) => find((c) => c.trim() === t))
			.with({ regex: P.select() }, (r) => find((c) => r.test(c)))
			.with({ left: P.select() }, (n) => ({ ...c, col: (c.col ?? 0) - n }))
			.with({ right: P.select() }, (n) => ({ ...c, col: (c.col ?? 0) + n }))
			.with({ above: P.select() }, (n) => ({ ...c, row: c.row - n }))
			.with({ below: P.select() }, (n) => ({ ...c, row: c.row + n }))
			.exhaustive();
	};

const apply = (read: Read, transform: Transform): Read => {
	if (read.kind === 'missing' || read.kind === 'failed') return read;
	return match(transform)
		.with('trim', () => onText(read, 'trim', (t) => ({ kind: 'text', text: t.trim() })))
		.with('number', () => onText(read, 'number', toAmount))
		.with('negate', () =>
			read.kind === 'amount'
				? { kind: 'amount' as const, amount: -read.amount as Amount }
				: failed(`negate needs an amount, got ${describe(read)}`),
		)
		.with({ date: P.select() }, (f) => onText(read, 'date', (t) => toDate(f, t)))
		.with({ replace: P.select() }, ({ from, to }) =>
			onText(read, 'replace', (t) => ({ kind: 'text', text: t.replaceAll(from, to) })),
		)
		.exhaustive();
};

const onText = (r: Read, n: string, u: (text: string) => Read) =>
	r.kind === 'text' ? u(r.text) : failed(`${n} needs text, got ${describe(r)}`);

const toAmount = (text: string): Read => {
	const amount = parseAmount(text.replaceAll('INR', ''));
	return amount === null
		? failed(`${JSON.stringify(text)} is not a number`)
		: { kind: 'amount', amount };
};

const toDate = (format: string, text: string): Read => {
	const date = parseDate({
		format,
		text: text.trim(),
		reference: STATEMENT_ERA,
	});
	return date === null
		? failed(`${JSON.stringify(text)} is not a ${format} date`)
		: { kind: 'date', date };
};

const failed = (r: string): Read => ({ kind: 'failed', reason: r });

const describe = (read: Read): string => {
	switch (read.kind) {
		case 'text':
			return `the text ${JSON.stringify(read.text)}`;
		case 'amount':
			return 'an amount';
		case 'date':
			return 'a date';
		case 'missing':
			return 'nothing';
		case 'failed':
			return 'a failure';
	}
};

const reason = (read: Read, expected: string): string => {
	switch (read.kind) {
		case 'missing':
			return 'there is nothing to read';
		case 'failed':
			return read.reason;
		default:
			return `expected ${expected}, got ${describe(read)}`;
	}
};
