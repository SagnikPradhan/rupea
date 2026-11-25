import { type Amount, toNumber } from '@rupea/shared/money.ts';
import { nameOf } from './accounts';
import { OTHER, PARTS } from './chart';
import { sumOf } from './numbers';

/**
 * How many accounts the last column names, the largest under any part, so a
 * long history still fits.
 */
const MOST = 8;
/**
 * The smallest share of the whole an account in the last column takes, as any
 * less would be a hairline.
 */
const SMALLEST = 0.02;

/**
 * An account in a column, the part whose shade it takes, and the account it
 * flows from.
 */
export type Flow = {
	key: string;
	label: string;
	amount: number;
	column: number;
	/** How many levels under a part it sits, which makes it lighter, or 0. */
	depth: number;
	part: number | null;
	from: string | null;
};

/** An account's total, and the account the server draws it under. */
type Row = { account: string; parent: string | null; amount: Amount };

type FlowsOptions = {
	rows: Row[];
	account: string;
	parts: string[];
	/**
	 * The colour each part takes, as coloursOf gives it; a part without one takes
	 * the next free.
	 */
	colours?: Record<string, number> | undefined;
};

/**
 * The account, its parts and the rest of it as other, then the largest accounts
 * under the parts, if large enough to see; refunds have nothing to flow.
 */
export const flowsOf = ({ rows, account, parts, colours }: FlowsOptions): Flow[] => {
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

/**
 * The parts of an account and the rest of it as other, the ones with something
 * to flow.
 */
const sharesOf = (
	{ rows, account, parts, colours = {} }: FlowsOptions,
	at: { column: number; from: string },
) => {
	const amounts = Object.fromEntries(rows.map((r) => [r.account, toNumber(r.amount)]));
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
		depth?: number;
	},
): Flow => ({
	key,
	label: nameOf(key),
	amount,
	depth: 0,
	...at,
});

/** The accounts right under a part, the largest first; other has none. */
const flowsUnder = (rows: Row[], parent: Flow) =>
	rows
		.filter((r) => r.parent === parent.key)
		.map((r) =>
			flow(r.account, toNumber(r.amount), {
				column: 2,
				part: parent.part,
				from: parent.key,
				depth: 1,
			}),
		)
		.filter((f) => f.amount > 0 && parent.key !== OTHER)
		.toSorted((a, b) => b.amount - a.amount);

const amountOf = (f: { amount: number }[]) => sumOf(f.map((x) => x.amount));
