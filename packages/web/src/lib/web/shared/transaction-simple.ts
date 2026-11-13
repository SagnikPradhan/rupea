import type { TransactionForm } from '@rupea/shared/forms.ts';

const HELD = ['Assets', 'Liabilities'];

/**
 * What each kind asks for: the box whose account takes the amount, then the one
 * it balances against.
 */
export const KINDS = {
	Expense: [
		{
			label: 'Category',
			hint: 'What the money was spent on.',
			types: ['Expenses'],
			placeholder: 'Food',
		},
		{ label: 'Paid from', hint: 'The account the money left.', types: HELD, placeholder: 'Bank' },
	],
	Income: [
		{ label: 'Paid into', hint: 'Where the money lands.', types: HELD, placeholder: 'Bank' },
		{
			label: 'Source',
			hint: 'Where the money came from.',
			types: ['Income'],
			placeholder: 'Salary',
		},
	],
	Transfer: [
		{ label: 'To', hint: 'The account it goes to.', types: HELD, placeholder: 'Savings' },
		{ label: 'From', hint: 'The account it leaves.', types: HELD, placeholder: 'Bank' },
	],
};

export type Kind = keyof typeof KINDS;

type Line = TransactionForm['postings'][number];

/** The simple view of two lines, or null when they say more than it can show. */
export function simpleOf(postings: Line[]) {
	const [first, second] = postings;
	if (!first || !second || postings.length !== 2) return null;
	if (!bare(first) || !bare(second)) return null;

	return read(first, second) ?? read(second, first);
}

/**
 * Reads the lines as given, first the box that takes the amount; the lines may
 * write the amount on either.
 */
function read(a: Line, b: Line) {
	const accounts = [a.account, b.account];
	const kind = Object.keys(KINDS).find((k) =>
		KINDS[k as Kind].every((x, i) => accounts[i] === '' || x.types.includes(typeOf(accounts[i]))),
	) as Kind | undefined;
	if (!kind) return null;

	const mirrored = b.amount === negate(a.amount) && a.commodity === b.commodity;
	if (a.amount !== '' && b.amount !== '' && !mirrored) return null;

	const amount = a.amount || negate(b.amount);
	const currency = a.commodity || b.commodity;
	const balances = [a.balance, b.balance];
	if (kind === 'Transfer' && amount.startsWith('-'))
		return {
			kind,
			amount: negate(amount),
			currency,
			accounts: accounts.reverse(),
			balances: balances.reverse(),
		};

	return { kind, amount, currency, accounts, balances };
}

const negate = (n: string) => {
	if (n === '') return '';
	return n.startsWith('-') ? n.slice(1) : `-${n.replace(/^\+/, '')}`;
};

const typeOf = (a: string | undefined) => a?.split(':')[0] ?? '';

const bare = (line: Line) =>
	line.price === '' &&
	!line.total &&
	line.cost === '' &&
	line.costDate === '' &&
	line.comment === '' &&
	line.metadata.length === 0;
