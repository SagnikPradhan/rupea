import { describe, expect, it } from 'vitest';
import * as Cards from '#lib/web/shared/cards.ts';
import * as Liabilities from '#lib/web/shared/liabilities.ts';
import { type Amount, parseAmount, toNumber } from '@rupea/shared/money.ts';

const amount = (t: string) => parseAmount(t) as Amount;
const on = (d: string) => Temporal.PlainDate.from(d);
const num = (a: Amount | null) => (a === null ? null : toNumber(a));

const ACCOUNT = 'Liabilities:Card';

type CardTerms = { statement?: number; due?: number; limit?: string };

const card = (owed: string, terms: CardTerms | null = { statement: 1, due: 20 }) =>
	Liabilities.debtsFrom(
		Liabilities.accountsIn([
			{ account: 'Liabilities', parent: null, total: amount(`-${owed}`), unpriced: 0 },
			{ account: ACCOUNT, parent: 'Liabilities', total: amount(`-${owed}`), unpriced: 0 },
		]),
		terms === null ? [] : [{ account: ACCOUNT, held: { kind: 'card', ...terms } }],
	);

const moved = (bucket: string, flows: { inflow?: string; outflow?: string }) => ({
	account: ACCOUNT,
	bucket: on(bucket),
	inflow: amount(flows.inflow ?? '0'),
	outflow: amount(flows.outflow ?? '0'),
});

type Moved = { account: string; bucket: Temporal.PlainDate; inflow: Amount; outflow: Amount };

const cycle = (debts: Liabilities.Debt[], flows: Moved[], today: string) =>
	Cards.cyclesFor(debts, { moved: flows, today: on(today) })[0]!;

describe('a card cycle', () => {
	it('closes on the statement day and falls due on the next due day', () => {
		const c = cycle(card('0', { statement: 15, due: 5 }), [], '2026-11-26');

		expect(c.closed?.toString()).toBe('2026-11-15');
		expect(c.due?.toString()).toBe('2026-12-05');
	});

	it('cuts a statement day past the month end to the last day', () => {
		const c = cycle(card('0', { statement: 31, due: 5 }), [], '2026-03-05');

		expect(c.closed?.toString()).toBe('2026-02-28');
		expect(c.due?.toString()).toBe('2026-03-05');
	});

	it('works the bill back from what is owed, less what was spent since and plus what was paid', () => {
		const flows = [
			moved('2026-11-14', { outflow: '500' }),
			moved('2026-11-20', { outflow: '2000' }),
			moved('2026-11-22', { inflow: '10000' }),
		];
		const c = cycle(card('12000', { statement: 15, due: 5 }), flows, '2026-11-26');

		expect([num(c.bill), num(c.spent), c.paid]).toEqual([20000, 2000, 'open']);
	});

	it('says a bill paid by the due day was paid in full', () => {
		const flows = [
			moved('2026-11-10', { outflow: '3000' }),
			moved('2026-11-18', { inflow: '9000' }),
		];

		expect(cycle(card('3000'), flows, '2026-11-26').paid).toBe('full');
	});

	it('tells a late payment, a part payment and none apart once the due day has passed', () => {
		const late = [
			moved('2026-11-10', { outflow: '3000' }),
			moved('2026-11-22', { inflow: '9000' }),
		];
		const part = [
			moved('2026-11-10', { outflow: '3000' }),
			moved('2026-11-18', { inflow: '4000' }),
		];
		const none = [moved('2026-11-10', { outflow: '3000' })];

		expect([
			cycle(card('3000'), late, '2026-11-26').paid,
			cycle(card('8000'), part, '2026-11-26').paid,
			cycle(card('12000'), none, '2026-11-26').paid,
		]).toEqual(['late', 'part', 'unpaid']);
	});

	it('has nothing to pay when the statement closed owing nothing', () => {
		const flows = [moved('2026-11-10', { outflow: '3000' })];

		expect(cycle(card('3000'), flows, '2026-11-26').paid).toBe('none');
	});

	it('has no bill without a statement day', () => {
		const c = cycle(card('3000', { limit: '50000' }), [], '2026-11-26');

		expect([c.closed, c.bill, c.spent, c.paid, num(c.limit)]).toEqual([
			null,
			null,
			null,
			null,
			50000,
		]);
	});
});

describe('the liabilities that are neither', () => {
	it('lists the leaves with no kind, and not the cards', () => {
		expect(Cards.unknownIn(card('100', null)).map((d) => d.account)).toEqual([ACCOUNT]);
		expect(Cards.unknownIn(card('100'))).toEqual([]);
	});
});
