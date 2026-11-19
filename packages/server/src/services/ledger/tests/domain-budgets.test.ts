import { defaultConfiguration } from '#lib/server/shared/context/config.ts';
import { budgetsOn, setBudget, type BudgetLine } from '#services/ledger/domain/budgets.ts';
import { fault } from '@rupea/shared/errors.ts';
import { parseAmount } from '#services/ledger/domain/amounts.ts';
import { describe, expect, it } from 'vitest';

const dateFormats = defaultConfiguration.ledger.dateFormats;
const day = (s: string) => Temporal.PlainDate.from(s);
const amount = (s: string) => parseAmount(s);

const line = (
	account: string,
	since: string | null,
	keys: Record<string, string>,
	at = 1,
	file = 'main.rupea',
): BudgetLine => ({
	account,
	since,
	keys: Object.fromEntries(Object.entries(keys).map(([k, x]) => [k, [x]])),
	file,
	line: at,
});

const on = (lines: BudgetLine[], d: string) =>
	budgetsOn(lines, { day: day(d), dateFormats }).map((b) => ({
		...b,
		from: b.from.toString(),
		to: b.to.toString(),
	}));

const set = (content: string, keys: [string, string][], account = 'Expenses:Food') =>
	setBudget(defaultConfiguration.ledger, { file: { key: 'main.rupea', content }, account, keys });

describe('setting the budget of an account', () => {
	it('starts a file with the B line when the file is empty', () => {
		expect(
			set('', [
				['limit', '15000'],
				['period', 'year'],
			])._unsafeUnwrap(),
		).toBe('B * Expenses:Food\n\t- limit: 15000\n\t- period: year\n');
	});

	it('adds the B line after the other entries', () => {
		const content = '2026-10-01 Pay\n\tExpenses:Food  100.00\n\tAssets:Bank\n';

		expect(set(content, [['limit', '15000']])._unsafeUnwrap()).toBe(
			`${content}\nB * Expenses:Food\n\t- limit: 15000\n`,
		);
	});

	it('rewrites the line in place, keeping its comments and every other entry', () => {
		const content = [
			'A * Liabilities:Card',
			'\t- kind: card',
			'',
			'; above',
			'',
			'B * Expenses:Food',
			'\t- limit: 15000',
			'; below',
			';; still below',
			'',
			'B 2026-06-01 Expenses:Food',
			'\t- limit: 1',
			'',
		].join('\n');

		expect(set(content, [['limit', '18000']])._unsafeUnwrap()).toBe(
			content.replace('15000', '18000'),
		);
	});

	it('keeps an unknown key the caller passes', () => {
		expect(
			set('', [
				['limit', '15000'],
				['note', 'eating out'],
			])._unsafeUnwrap(),
		).toBe('B * Expenses:Food\n\t- limit: 15000\n\t- note: eating out\n');
	});

	it('finds the line whatever the case of the account', () => {
		const content = 'B * Expenses:food\n\t- limit: 1\n';

		expect(set(content, [['limit', '2']])._unsafeUnwrap()).toBe(
			'B * Expenses:Food\n\t- limit: 2\n',
		);
	});

	it('refuses a value that would not read back as written', () => {
		expect(set('', [['limit', '1\n2026-10-01 Sneak']])._unsafeUnwrapErr()).toEqual(
			fault('CannotWriteBudget', { path: 'main.rupea' }),
		);
	});
});

describe('budgets on a day', () => {
	it('reads a starred line as a monthly budget', () => {
		expect(on([line('Expenses:Food', null, { limit: '15000' })], '2026-10-15')).toEqual([
			{
				account: 'Expenses:Food',
				length: 'month',
				limit: amount('15000'),
				current: { limit: '15000' },
				from: '2026-10-01',
				to: '2026-10-31',
			},
		]);
	});

	it('lets a later line override only the keys it names', () => {
		const lines = [
			line('Expenses:Food', null, { limit: '15000', period: 'year' }),
			line('Expenses:Food', '2027-04-01', { limit: '18000' }),
		];

		expect(on(lines, '2027-05-10')[0]).toMatchObject({
			length: 'year',
			limit: amount('18000'),
			from: '2027-01-01',
			to: '2027-12-31',
		});
	});

	it('takes the later written of two lines for one day', () => {
		const lines = [
			line('Expenses:Food', '2026-10-01', { limit: '2' }, 5),
			line('Expenses:Food', '2026-10-01', { limit: '1' }, 2),
		];

		expect(on(lines, '2026-10-02')[0]?.limit).toBe(amount('2'));
	});

	it('orders two files for one day by file name', () => {
		const lines = [
			line('Expenses:Food', '2026-10-01', { limit: '2' }, 1, 'b.rupea'),
			line('Expenses:Food', '2026-10-01', { limit: '1' }, 9, 'a.rupea'),
		];

		expect(on(lines, '2026-10-02')[0]?.limit).toBe(amount('2'));
	});

	it('matches accounts whatever their case and names the account as the star line writes it', () => {
		const lines = [
			line('expenses:food', '2026-09-01', { limit: '1' }),
			line('Expenses:Food', null, { limit: '5' }),
		];
		const budgets = on(lines, '2026-10-02');

		expect(budgets).toHaveLength(1);
		expect(budgets[0]).toMatchObject({ account: 'Expenses:Food', limit: amount('1') });
	});

	it('names the first line account when no star line exists', () => {
		const lines = [
			line('Expenses:Food', '2026-09-01', { limit: '1' }),
			line('expenses:FOOD', '2026-09-02', { limit: '2' }),
		];

		expect(on(lines, '2026-10-02')[0]?.account).toBe('Expenses:Food');
	});

	it('gives each account its own budget', () => {
		const lines = [
			line('Expenses:Food', null, { limit: '1' }),
			line('Expenses:Food:Dining', null, { limit: '2' }),
		];

		expect(on(lines, '2026-10-02').map((b) => b.limit)).toEqual([amount('1'), amount('2')]);
	});

	it('gives no budget before the first dated line', () => {
		expect(on([line('Expenses:Food', '2026-10-01', { limit: '1' })], '2026-09-30')).toEqual([]);
	});

	it('gives no budget when no line gives a limit', () => {
		expect(on([line('Expenses:Food', null, { period: 'year' })], '2026-10-02')).toEqual([]);
	});

	it('cuts the period under way on both sides of a line that names start', () => {
		const lines = [
			line('Expenses:Food', null, { limit: '1' }),
			line('Expenses:Food', '2026-10-10', { limit: '2', start: '2026-10-10' }),
		];

		expect(on(lines, '2026-10-05')[0]).toMatchObject({
			limit: amount('1'),
			from: '2026-10-01',
			to: '2026-10-09',
		});
		expect(on(lines, '2026-10-20')[0]).toMatchObject({
			limit: amount('2'),
			from: '2026-10-10',
			to: '2026-11-09',
		});
	});

	it('cuts the same way for a line that names only period', () => {
		const lines = [
			line('Expenses:Food', null, { limit: '1' }),
			line('Expenses:Food', '2026-10-10', { period: 'year' }),
		];

		expect(on(lines, '2026-10-05')[0]).toMatchObject({
			length: 'month',
			from: '2026-10-01',
			to: '2026-10-09',
		});
		expect(on(lines, '2026-10-20')[0]).toMatchObject({
			length: 'year',
			limit: amount('1'),
			from: '2026-10-10',
			to: '2027-10-09',
		});
	});

	it('keeps the old anchor before the cut and the new one after a later line', () => {
		const lines = [
			line('Expenses:Food', null, { limit: '1', start: '2026-04-25' }),
			line('Expenses:Food', '2026-10-10', { start: '2026-10-10' }),
			line('Expenses:Food', '2026-12-01', { limit: '3' }),
		];

		expect(on(lines, '2026-10-01')[0]).toMatchObject({
			from: '2026-09-25',
			to: '2026-10-09',
		});
		expect(on(lines, '2026-12-05')[0]).toMatchObject({
			limit: amount('3'),
			from: '2026-11-10',
			to: '2026-12-09',
		});
	});

	it('runs a year from its start', () => {
		const lines = [
			line('Expenses:Travel', null, { limit: '1', period: 'year', start: '2026-04-01' }),
		];

		expect(on(lines, '2026-10-02')[0]).toMatchObject({
			length: 'year',
			from: '2026-04-01',
			to: '2027-03-31',
		});
	});

	it('reads a start in another of the date formats', () => {
		const lines = [line('Expenses:Food', null, { limit: '1', start: '25/04/2026' })];

		expect(on(lines, '2026-10-30')[0]).toMatchObject({
			from: '2026-10-25',
			to: '2026-11-24',
		});
	});

	it('counts a start that does not read as absent', () => {
		const lines = [line('Expenses:Food', null, { limit: '1', start: 'soon' })];

		expect(on(lines, '2026-10-30')[0]).toMatchObject({
			from: '2026-10-01',
			to: '2026-10-31',
		});
	});

	it('anchors a year at the date of a line that names only period', () => {
		const lines = [
			line('Expenses:Food', null, { limit: '1000' }),
			line('Expenses:Food', '2026-10-10', { period: 'year' }),
		];

		expect(on(lines, '2026-10-15')[0]).toMatchObject({
			length: 'year',
			from: '2026-10-10',
			to: '2027-10-09',
		});
		expect(on(lines, '2027-10-10')[0]).toMatchObject({
			from: '2027-10-10',
			to: '2028-10-09',
		});
	});

	it('anchors at the date of a line whose start value differs from it', () => {
		const lines = [
			line('Expenses:Food', null, { limit: '1' }),
			line('Expenses:Food', '2026-10-10', { start: '2026-10-20' }),
		];

		expect(on(lines, '2026-10-15')[0]).toMatchObject({
			from: '2026-10-10',
			to: '2026-11-09',
		});
	});

	it('answers the star line keys as written, unknown ones too', () => {
		const lines = [line('Expenses:Food', null, { limit: '15000', note: 'rent, mostly' })];

		expect(on(lines, '2026-10-15')[0]?.current).toEqual({ limit: '15000', note: 'rent, mostly' });
	});

	it('leaves the keys of dated lines out of current', () => {
		const lines = [
			line('Expenses:Food', null, { limit: '1' }),
			line('Expenses:Food', '2026-10-01', { limit: '2', note: 'later' }),
		];

		expect(on(lines, '2026-10-15')[0]?.current).toEqual({ limit: '1' });
	});

	it('answers nothing as current when only dated lines exist', () => {
		expect(
			on([line('Expenses:Food', '2026-10-01', { limit: '2' })], '2026-10-15')[0]?.current,
		).toEqual({});
	});
});
