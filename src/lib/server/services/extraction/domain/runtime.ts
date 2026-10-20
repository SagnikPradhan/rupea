import { parseDate } from '#lib/server/shared/dates.ts';
import { batch, type Batch } from '#lib/server/shared/result/batch.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { err, ok, type Result } from '#lib/server/shared/result/result.ts';
import { displayLocation, parseAmount, type Amount } from '#services/ledger/application/shared.ts';
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

type ReadRecordsOptions = {
	schema: RupeeSchema;
	file: string;
	grid: Grid;
};

export const readRecords = ({
	schema,
	grid,
	file,
}: ReadRecordsOptions): Result<Batch<RupeeRecord>> =>
	layout({ schema, grid, file }).map(({ sheet, header }) => {
		// A statement may repeat its header, as on every page of a PDF.
		const repeats = (c: string[]) => c.join('\t').trim() === (grid[header] ?? []).join('\t').trim();

		const rows = grid.flatMap((c, r) => (r > header && !isBlank(c) && !repeats(c) ? [r] : []));
		const kept = rows.filter((r) => keeps({ schema, sheet, row: r }));

		// Keeping no row means the schema reads it wrong, so every row says why.
		return batch((kept.length > 0 ? kept : rows).map((r) => record({ schema, sheet, row: r })));
	});

/** Where a schema's header and columns sit in a grid, which fails unless the grid has them all. */
export const layout = ({
	schema,
	file,
	grid,
}: ReadRecordsOptions): Result<{ sheet: Sheet; header: number }> => {
	const header = grid.findIndex((c) =>
		schema.header ? c.some((l) => isHeader(schema.header, l)) : !isBlank(c),
	);
	if (header < 0) return err(fault('ExtractionMissingHeader', { path: file }));

	const names = (grid[header] ?? []).map((c, i): [string, number] => [c.trim(), i]);
	// Reversed so that the first of two same-named columns wins.
	const sheet: Sheet = { file, grid, headers: new Map(names.reverse()) };

	const missing = columns(schema).filter((n) => column(sheet, n) === null);
	if (missing.length > 0)
		return err(fault('ExtractionMissingColumns', { path: file, columns: missing }));

	return ok({ sheet, header });
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
	if (!records.where)
		return readField({ sheet, row, paths: schema.fields.date, kind: 'date' }).kind === 'date';

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
		err(
			fault('ExtractionInvalidField', {
				location: displayLocation(location),
				field,
				reason: reason(read, expected),
			}),
		);

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

const readField = ({ sheet, row, paths, kind }: ReadFieldOptions): Read => {
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
