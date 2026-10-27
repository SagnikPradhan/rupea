import * as v from 'valibot';

export const EXPENSES = 'Expenses';
export const ASSETS = 'Assets';
const LIABILITIES = 'Liabilities';

/** The account the expenses page is narrowed to, Expenses itself unless one under it is given. */
export const ExpenseAccount = v.fallback(
	v.pipe(v.string(), v.trim(), v.check(isUnderAny([EXPENSES]))),
	EXPENSES,
);

/** The account net worth is narrowed to, an Assets or Liabilities one, or none for every balance account. */
export const BalanceAccount = v.fallback(
	v.nullable(v.pipe(v.string(), v.trim(), v.check(isUnderAny([ASSETS, LIABILITIES])))),
	null,
);

/** Accounts are named in any case, as the server matches them. */
function isUnderAny(tops: string[]) {
	return (a: string) =>
		tops.some(
			(t) =>
				a.toLowerCase() === t.toLowerCase() || a.toLowerCase().startsWith(`${t.toLowerCase()}:`),
		);
}
