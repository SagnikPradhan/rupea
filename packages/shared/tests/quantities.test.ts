import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { parseAmount, type Amount } from '@rupea/shared/amounts.ts';
import { PostedOut, printPosted } from '@rupea/shared/quantities.ts';

const amount = (text: string) => parseAmount(text) as Amount;

const wire = (posted: {
	amount: string;
	commodity: string;
	price?: { amount: string; commodity: string; kind: 'unit' | 'total' };
	cost?: { amount: string; commodity: string; date: Temporal.PlainDate | null };
}) =>
	v.parse(PostedOut, {
		amount: amount(posted.amount),
		commodity: posted.commodity,
		price: posted.price ? { ...posted.price, amount: amount(posted.price.amount) } : null,
		cost: posted.cost ? { ...posted.cost, amount: amount(posted.cost.amount) } : null,
	});

describe('printing a posting', () => {
	it('leaves the rupee out of a plain amount', () => {
		expect(printPosted(wire({ amount: '2000.5', commodity: 'INR' }))).toBe('2000.50');
	});

	it('keeps a sign', () => {
		expect(printPosted(wire({ amount: '-15001.25', commodity: 'INR' }))).toBe('-15001.25');
	});

	it('names another commodity', () => {
		expect(printPosted(wire({ amount: '10', commodity: 'INFY' }))).toBe('10.00 INFY');
	});

	it('shows a unit price with @ and a total price with @@', () => {
		const price = { amount: '1500.125', commodity: 'INR' };
		const unit = wire({ amount: '10', commodity: 'INFY', price: { ...price, kind: 'unit' } });
		const total = wire({ amount: '10', commodity: 'INFY', price: { ...price, kind: 'total' } });
		expect(printPosted(unit)).toBe('10.00 INFY @ 1500.125');
		expect(printPosted(total)).toBe('10.00 INFY @@ 1500.125');
	});

	it('shows a lot cost with its date, and before a price', () => {
		const cost = { amount: '1400', commodity: 'INR' };
		const posted = {
			amount: '-5',
			commodity: 'INFY',
			price: { amount: '1500', commodity: 'INR', kind: 'unit' as const },
		};
		const dated = { ...cost, date: Temporal.PlainDate.from('2026-01-02') };
		expect(printPosted(wire({ ...posted, cost: dated }))).toBe(
			'-5.00 INFY {1400.00, 2026-01-02} @ 1500.00',
		);
		expect(printPosted(wire({ ...posted, cost: { ...cost, date: null } }))).toBe(
			'-5.00 INFY {1400.00} @ 1500.00',
		);
	});
});
