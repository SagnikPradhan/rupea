import { dayNumberOf } from '#lib/server/shared/dates.ts';
import { parseAmount, type Amount } from '#services/ledger/domain/amounts.ts';
import type { Row } from '#services/ledger/domain/deltas.ts';
import { returnsOf, type Flow } from '#services/ledger/domain/returns.ts';
import { parentsOf } from '#services/ledger/domain/taxonomy.ts';
import { describe, expect, it } from 'vitest';

const amount = (text: string) => parseAmount(text) ?? (0n as Amount);
const day = (d: string) => Temporal.PlainDate.from(d);

const held = (account: string, value: string | null): Row => ({
	account,
	commodity: null,
	bucket: '2025-01-01',
	unpriced: value === null ? 1 : 0,
	...(value === null ? {} : { value: amount(value) }),
});

const flow = (account: string, d: string, value: string, unpriced = 0) => ({
	account,
	day: dayNumberOf(d),
	amount: amount(value),
	unpriced,
});

const rolledRows = (rows: Row[]): Row[] =>
	Object.values(
		rows.reduce<Record<string, Row>>((totals, r) => {
			for (const account of parentsOf(r.account)) {
				const total = (totals[account] ??= { ...r, account, unpriced: 0, value: 0n as Amount });
				total.unpriced += r.unpriced;
				total.value = ((total.value ?? 0n) + (r.value ?? 0n)) as Amount;
			}

			return totals;
		}, {}),
	);

const rolledFlows = (flows: Flow[]): Flow[] =>
	Object.values(
		flows.reduce<Record<string, Flow>>((totals, f) => {
			for (const account of parentsOf(f.account)) {
				const total = (totals[`${account} ${f.day}`] ??= {
					...f,
					account,
					amount: 0n as Amount,
					unpriced: 0,
				});
				total.amount = (total.amount + f.amount) as Amount;
				total.unpriced += f.unpriced;
			}

			return totals;
		}, {}),
	);

describe('returnsOf', () => {
	it('solves the rate Excel’s XIRR gives for its own example', () => {
		const returns = returnsOf({
			accounts: ['Assets:Fund'],
			start: [],
			end: rolledRows([held('Assets:Fund', '2750')]),
			flows: rolledFlows([
				flow('Assets:Fund', '2008-01-01', '10000'),
				flow('Assets:Fund', '2008-03-01', '-2750'),
				flow('Assets:Fund', '2008-10-30', '-4250'),
				flow('Assets:Fund', '2009-02-15', '-3250'),
			]),
			span: { from: day('2008-01-01'), to: day('2009-04-01') },
		});

		expect(returns).toEqual([
			{
				account: 'Assets:Fund',
				netIn: -250_0000000000n,
				xirr: expect.closeTo(0.373362535, 8),
				yearly: true,
				unpriced: 0,
			},
		]);
	});

	it('adds up the accounts under one, where moves between them cancel', () => {
		const returns = returnsOf({
			accounts: ['Assets', 'Assets:Bank', 'Assets:Fund', 'Liabilities:Card'],
			start: rolledRows([held('Assets:Bank', '1000'), held('Liabilities:Card', '-50')]),
			end: rolledRows([held('Assets:Fund', '1100')]),
			flows: rolledFlows([
				flow('Assets:Bank', '2025-01-01', '-1000'),
				flow('Assets:Fund', '2025-01-01', '1000'),
			]),
			span: { from: day('2025-01-01'), to: day('2025-12-31') },
		});

		expect(returns.map((r) => [r.account, r.netIn, r.xirr])).toEqual([
			['Assets', 0n, expect.closeTo(0.1, 2)],
			['Assets:Bank', -1000_0000000000n, expect.closeTo(0, 6)],
			['Assets:Fund', 1000_0000000000n, expect.closeTo(0.1, 2)],
		]);
	});

	it('finds a loss of nearly everything, which Newton’s method oversteps', () => {
		const returns = returnsOf({
			accounts: ['Assets:Fund'],
			start: rolledRows([held('Assets:Fund', '100000')]),
			end: rolledRows([held('Assets:Fund', '0.01')]),
			flows: [],
			span: { from: day('2025-01-01'), to: day('2025-12-31') },
		});

		expect(returns[0]?.xirr).toBeCloseTo(-0.9999999, 6);
	});

	it('takes the rate nearest 10% when the flows give two, which a bracket from -100% to a high rate would miss', () => {
		const returns = returnsOf({
			accounts: ['Assets:Fund'],
			start: rolledRows([held('Assets:Fund', '100')]),
			end: rolledRows([held('Assets:Fund', '-140.4')]),
			flows: rolledFlows([flow('Assets:Fund', '2026-01-01', '-238')]),
			span: { from: day('2025-01-02'), to: day('2027-01-01') },
		});

		expect(returns[0]?.xirr).toBeCloseTo(0.08, 6);
	});

	it('has no rate when nothing went in, or something had no price', () => {
		const returns = returnsOf({
			accounts: ['Assets:Bank', 'Assets:Fund'],
			start: [],
			end: rolledRows([held('Assets:Bank', '10'), held('Assets:Fund', null)]),
			flows: rolledFlows([flow('Assets:Fund', '2025-03-01', '0', 1)]),
			span: { from: day('2025-01-01'), to: day('2025-12-31') },
		});

		expect(returns.map((r) => [r.account, r.xirr, r.unpriced])).toEqual([
			['Assets:Bank', null, 0],
			['Assets:Fund', null, 2],
		]);
	});

	const whyOf = (options: { start: Row[]; end: Row[]; flows?: Flow[] }) =>
		returnsOf({
			accounts: ['Assets:Fund'],
			flows: [],
			...options,
			span: { from: day('2025-01-01'), to: day('2025-12-31') },
		})[0]?.why;

	it('says why there is no rate', () => {
		const fund = (value: string | null) => rolledRows([held('Assets:Fund', value)]);

		expect(whyOf({ start: [], end: fund(null) })).toBe('unpriced');
		expect(whyOf({ start: fund('0'), end: fund('0') })).toBe('nothing');
		expect(whyOf({ start: fund('100'), end: fund('50') })).toBeUndefined();
		expect(whyOf({ start: fund('100'), end: fund('-50') })).toBe('unsolved');
	});

	it('gives no rate for flows on a single day, however they net', () => {
		const returns = returnsOf({
			accounts: ['Assets:Fund'],
			start: [],
			end: rolledRows([held('Assets:Fund', '110')]),
			flows: rolledFlows([flow('Assets:Fund', '2025-12-31', '100')]),
			span: { from: day('2025-12-31'), to: day('2025-12-31') },
		});

		expect(returns[0]).toMatchObject({ xirr: null, why: 'nothing' });
	});

	it('gives no rate for a balance that went negative, where no rate fits', () => {
		const returns = returnsOf({
			accounts: ['Assets:Fund'],
			start: rolledRows([held('Assets:Fund', '100')]),
			end: rolledRows([held('Assets:Fund', '-100')]),
			flows: [],
			span: { from: day('2025-01-01'), to: day('2025-12-31') },
		});

		expect(returns[0]).toMatchObject({ xirr: null, yearly: false, why: 'unsolved' });
	});

	it('gives no rate when the one that fits is beyond what a float can hold', () => {
		const returns = returnsOf({
			accounts: ['Assets:Fund'],
			start: rolledRows([held('Assets:Fund', '0.0000000001')]),
			end: rolledRows([held('Assets:Fund', '1000000000000')]),
			flows: [],
			span: { from: day('2025-01-01'), to: day('2025-12-31') },
		});

		expect(returns[0]).toMatchObject({ xirr: null, why: 'unsolved' });
	});
});
