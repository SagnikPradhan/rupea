import { INCOME } from '#lib/shared/accounts.ts';
import { nameOf } from './accounts';
import { OTHER, PARTS } from './chart';
import { sumOf } from './numbers';

/** How many accounts the last column names, the largest under any part, so a long history still fits. */
const MOST = 8;
/** The smallest share of the whole an account in the last column takes, as any less would be a hairline. */
const SMALLEST = 0.02;

/** An account in a column, the part whose shade it takes, the account it flows from, and the account in the next column it flows into when no other flows there. */
export type Flow = {
	key: string;
	label: string;
	amount: number;
	column: number;
	/** How many levels under a part it sits, which makes it lighter, or 0. */
	depth: number;
	part: number | null;
	from: string | null;
	into: string | null;
};

/** An account's total, and the account the server draws it under. */
type Row = { account: string; parent: string | null; amount: string };

type FlowsOptions = {
	rows: Row[];
	account: string;
	parts: string[];
	/** The colour each part takes, as coloursOf gives it; a part without one takes the next free. */
	colours?: Record<string, number> | undefined;
	/** What the Income accounts were credited, as the server counts it, negative. */
	income?: Row[];
};

/** The key of what income left over, which is no account. */
export const SAVED = 'Saved';

/** The sources of income, Income, then the parts, other and what was saved; or, without income, the account, its parts and the accounts under them, if large enough to see. */
export const flowsOf = ({
	rows,
	account,
	parts,
	colours = {},
	income = [],
}: FlowsOptions): Flow[] =>
	income.some((r) => r.parent === INCOME && Number(r.amount) < 0)
		? flowsKept({ rows, account, parts, colours, income })
		: flowsSpent({ rows, account, parts, colours });

/** The account, its parts and the rest of it as other, then the largest accounts under the parts, if large enough to see; refunds have nothing to flow. */
const flowsSpent = ({ rows, account, parts, colours }: FlowsOptions): Flow[] => {
	const middle = sharesOf({ rows, account, parts, colours }, { column: 1, from: account });
	const whole = amountOf(middle);
	const under = middle
		.flatMap((m) => flowsUnder(rows, m))
		.toSorted((a, b) => b.amount - a.amount)
		.filter((f) => f.amount >= whole * SMALLEST)
		.slice(0, MOST)
		.toSorted((a, b) => (a.part ?? 0) - (b.part ?? 0) || b.amount - a.amount);

	return [flow(account, whole, { column: 0, part: null, from: null }), ...middle, ...under];
};

/** Each source of income into Income, then into the parts, other and what was left over. */
const flowsKept = ({ rows, account, parts, colours, income = [] }: FlowsOptions): Flow[] => {
	const sources = income
		.filter((r) => r.parent === INCOME && Number(r.amount) < 0)
		.map((r) =>
			flow(r.account, -Number(r.amount), { column: 0, part: null, from: null, into: INCOME }),
		)
		.toSorted((a, b) => b.amount - a.amount);
	const earned = amountOf(sources);
	const middle = sharesOf({ rows, account, parts, colours }, { column: 2, from: INCOME });
	const kept = earned - amountOf(middle);

	return [
		...sources,
		flow(INCOME, earned, { column: 1, part: null, from: null }),
		...middle,
		...(kept > 0 ? [flow(SAVED, kept, { column: 2, part: null, from: INCOME })] : []),
	];
};

/** The parts of an account and the rest of it as other, the ones with something to flow. */
const sharesOf = (
	{ rows, account, parts, colours = {} }: FlowsOptions,
	at: { column: number; from: string },
) => {
	const amounts = Object.fromEntries(rows.map((r) => [r.account, Number(r.amount)]));
	const shares = parts.map((p, k) => flow(p, amounts[p] ?? 0, { ...at, part: colours[p] ?? k }));
	const rest = (amounts[account] ?? 0) - amountOf(shares);
	const other = flow(OTHER, rest, { ...at, part: PARTS - 1 });

	return [...shares, other].filter((f) => f.amount > 0);
};

const flow = (
	key: string,
	amount: number,
	at: {
		column: number;
		part: number | null;
		from: string | null;
		into?: string;
		depth?: number;
	},
): Flow => ({
	key,
	label: nameOf(key),
	amount,
	into: null,
	depth: 0,
	...at,
});

/** The accounts right under a part, the largest first; other has none. */
const flowsUnder = (rows: Row[], parent: Flow) =>
	rows
		.filter((r) => r.parent === parent.key)
		.map((r) =>
			flow(r.account, Number(r.amount), {
				column: 2,
				part: parent.part,
				from: parent.key,
				depth: 1,
			}),
		)
		.filter((f) => f.amount > 0 && parent.key !== OTHER)
		.toSorted((a, b) => b.amount - a.amount);

const amountOf = (f: { amount: number }[]) => sumOf(f.map((x) => x.amount));
