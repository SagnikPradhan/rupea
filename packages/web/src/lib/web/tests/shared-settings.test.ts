import { describe, expect, it } from 'vitest';
import { askedIn, liabilitiesOf } from '#lib/web/shared/settings.ts';

const account = (a: string, parent: string | null) => ({ account: a, parent });

const card = { kind: 'card' as const, limit: '100000' };
const loan = { kind: 'loan' as const, rate: 8.5, method: 'reducing' as const };

const accounts = [
	account('Assets', null),
	account('Assets:Bank', 'Assets'),
	account('Liabilities', null),
	account('Liabilities:Cards', 'Liabilities'),
	account('Liabilities:Cards:Regalia', 'Liabilities:Cards'),
	account('Liabilities:Loans', 'Liabilities'),
	account('Liabilities:Loans:Home', 'Liabilities:Loans'),
	account('Liabilities:Friend', 'Liabilities'),
];

describe('liabilitiesOf', () => {
	const terms = [
		{ account: 'liabilities:cards:regalia', current: {}, held: card },
		{ account: 'Liabilities:Loans:Home', current: {}, held: loan },
	];

	it('puts each liability that takes payments under the kind its terms set up', () => {
		const groups = liabilitiesOf(accounts, terms);

		expect(groups.cards.map((l) => l.account)).toEqual(['Liabilities:Cards:Regalia']);
		expect(groups.loans.map((l) => l.account)).toEqual(['Liabilities:Loans:Home']);
		expect(groups.unset.map((l) => l.account)).toEqual(['Liabilities:Friend']);
	});

	it('leaves out the accounts with others under them, and those not owed', () => {
		const all = Object.values(liabilitiesOf(accounts, [])).flat();

		expect(all.map((l) => l.account)).toEqual([
			'Liabilities:Cards:Regalia',
			'Liabilities:Friend',
			'Liabilities:Loans:Home',
		]);
	});

	it('lists terms whose account has nothing posted yet', () => {
		const fresh = { account: 'Liabilities:Cards:New', current: {}, held: card };

		expect(liabilitiesOf(accounts, [fresh]).cards.map((l) => l.account)).toEqual([
			'Liabilities:Cards:New',
		]);
	});

	it('counts terms that do not read as not set up', () => {
		const broken = { account: 'Liabilities:Friend', current: { kind: 'bond' }, held: null };

		const unset = liabilitiesOf(accounts, [broken]).unset;
		const friend = unset.find((l) => l.account === 'Liabilities:Friend');

		expect(friend?.terms?.current).toEqual({ kind: 'bond' });
	});
});

describe('askedIn', () => {
	it('hands over what a link asks of its own ledger only', () => {
		const q = new URLSearchParams('ledger=h&setup=Liabilities:Card');

		expect(askedIn(q, 'h').get('setup')).toBe('Liabilities:Card');
		expect(askedIn(q, 'other').get('setup')).toBeNull();
	});
});
