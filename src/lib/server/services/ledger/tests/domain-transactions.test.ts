import { defaultConfiguration } from '#lib/server/shared/context/config.ts';
import { TransactionForm } from '#lib/shared/transaction-form.ts';
import { insert } from '#services/ledger/domain/transactions.ts';
import { parse } from '#services/ledger/domain/parser.ts';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

const posting = (account: string, amount = '') => ({
	account,
	amount,
	commodity: '',
	price: '',
	total: false,
	cost: '',
	costDate: '',
	balance: '',
	comment: '',
	metadata: [],
});

const form: TransactionForm = {
	file: 'a.rupea',
	date: '2026-08-15',
	time: '',
	description: 'Groceries',
	comment: '',
	metadata: [],
	postings: [posting('Expenses:Food', '100.5'), posting('Assets:Bank')],
};

const january = '2026-01-01 Salary\n\tAssets:Bank    50000.00\n\tIncome:Salary\n';
const december = '2026-12-01 Rent\n\tExpenses:Rent  100.00\n\tAssets:Bank\n';

const inserted = (content: string, f: TransactionForm = form) =>
	insert(defaultConfiguration.ledger, { file: { key: 'a.rupea', content }, form: f });

describe('inserting a transaction', () => {
	it('starts an empty file, leaving an empty amount out', () => {
		expect(inserted('')._unsafeUnwrap()).toEqual({
			content: '2026-08-15 Groceries\n\tExpenses:Food  100.50\n\tAssets:Bank\n',
			line: 1,
		});
	});

	it('goes above the first transaction dated after it, and says at which line', () => {
		const { content, line } = inserted(`${january}\n${december}`)._unsafeUnwrap();

		expect(line).toBe(5);
		expect(
			parse(defaultConfiguration.ledger, { key: 'a.rupea', content }).succeeded.map(
				(t) => t.description,
			),
		).toEqual(['Salary', 'Groceries', 'Rent']);
	});

	it('goes after a transaction of the same day, and at the end when none is later', () => {
		const same = inserted(january, { ...form, date: '2026-01-01' })._unsafeUnwrap();
		const last = inserted(january)._unsafeUnwrap();

		expect(same.line).toBe(5);
		expect(last.line).toBe(5);
	});

	it('keeps comments and P lines of the file', () => {
		const content = `P 2026-01-01 INFY 1500.00\n\n; a note\n\n${january}`;

		expect(inserted(content)._unsafeUnwrap().content).toContain('P 2026-01-01 INFY 1500.00');
		expect(inserted(content)._unsafeUnwrap().content).toContain('; a note\n');
	});

	it('writes every box of a posting', () => {
		const { content } = inserted('', {
			...form,
			time: '18:45',
			comment: 'one\ntwo',
			metadata: [{ key: 'ref', value: '402' }],
			postings: [
				{
					...posting('Assets:Zerodha', '-4'),
					commodity: 'infy',
					price: '1700',
					cost: '1500',
					costDate: '2019-03-04',
					balance: '6',
					comment: 'sold',
					metadata: [{ key: 'tags', value: 'gift' }],
				},
				posting('Assets:Bank', '6800'),
				posting('Income:Gains', '-800'),
			],
		})._unsafeUnwrap();

		expect(content).toBe(
			[
				'2026-08-15 18:45 Groceries',
				'\t; one',
				'\t; two',
				'\t- ref: 402',
				'\tAssets:Zerodha  -4.00 INFY {1500.00, 2019-03-04} @ 1700.00 = 6.00 INFY',
				'\t\t; sold',
				'\t\t- tags: gift',
				'\tAssets:Bank     6800.00',
				'\tIncome:Gains    -800.00',
				'',
			].join('\n'),
		);
	});

	it('says by how much a transaction is off', () => {
		const off = inserted('', {
			...form,
			postings: [posting('Expenses:Food', '100'), posting('Assets:Bank', '-90')],
		});

		expect(off._unsafeUnwrapErr()).toMatchObject({
			type: 'ParseUnbalancedTransaction',
			residual: '10.00',
		});
	});

	it('refuses a description that would read back as a time', () => {
		expect(inserted('', { ...form, description: '10:30 lunch' })._unsafeUnwrapErr()).toEqual({
			type: 'CannotWriteTransaction',
			path: 'a.rupea',
		});
	});

	it('refuses a file where the next read would swallow it', () => {
		expect(inserted('not a header\n')._unsafeUnwrapErr()).toEqual({
			type: 'CannotWriteTransaction',
			path: 'a.rupea',
		});
	});
});

describe('the form schema', () => {
	const issue = (changes: object) => {
		const checked = v.safeParse(TransactionForm, { ...form, ...changes });
		return checked.issues?.map((i) => [v.getDotPath(i), i.message]);
	};
	const postingIssue = (changes: object) =>
		issue({ postings: [{ ...posting('Assets:Bank'), ...changes }] });

	it('takes a filled form', () => {
		expect(issue({})).toBeUndefined();
	});

	it('names the box that is wrong', () => {
		expect(issue({ description: ' ' })?.[0]?.[0]).toBe('description');
		expect(issue({ file: 'a.txt' })?.[0]?.[0]).toBe('file');
		expect(issue({ file: '_/imports/a.rupea' })?.[0]?.[0]).toBe('file');
		expect(postingIssue({ account: 'Food' })?.[0]?.[0]).toBe('postings.0.account');
		expect(postingIssue({ amount: '1.2.3' })?.[0]?.[0]).toBe('postings.0.amount');
	});

	it('wants an amount beside a commodity, a price or a cost, and a cost beside its date', () => {
		expect(postingIssue({ price: '10' })?.[0]?.[0]).toBe('postings.0.amount');
		expect(postingIssue({ amount: '1', costDate: '2026-01-01' })?.[0]?.[0]).toBe('postings.0.cost');
	});

	it('takes a time with or without seconds', () => {
		expect(issue({ time: '18:45' })).toBeUndefined();
		expect(issue({ time: '18:45:30' })).toBeUndefined();
		expect(issue({ time: '25:00' })?.[0]?.[0]).toBe('time');
	});

	it('leaves group keys to the refine page', () => {
		expect(issue({ metadata: [{ key: 'group', value: 'x' }] })?.[0]?.[1]).toBe(
			'Groups are made on the refine page.',
		);
	});
});
