import { type Amount, ZERO, sum } from '@rupea/shared/money.ts';
import type { Debt } from './liabilities';

/**
 * Days back to read a card's postings: a statement closes at most this long
 * before the day, and the read stays in days.
 */
export const DAYS_READ = 30;

/**
 * Whether the last bill was paid: in full by its due day, late, in part, not at
 * all, not yet due, or nothing to pay.
 */
export type Paid = 'full' | 'late' | 'part' | 'unpaid' | 'open' | 'none';

/** A card on a day: its last statement, the bill it left, and how it was paid. */
export type Cycle = {
	account: string;
	owed: Amount;
	limit: Amount | null;
	closed: Temporal.PlainDate | null;
	due: Temporal.PlainDate | null;
	bill: Amount | null;
	spent: Amount | null;
	paid: Paid | null;
};

type Moved = { account: string; bucket: Temporal.PlainDate; inflow: Amount; outflow: Amount };

type CyclesForOptions = { moved: Moved[]; today: Temporal.PlainDate };

/**
 * Each card's cycle on a day: when its last statement closed and the bill it
 * left, what was spent since, and whether the bill was paid by the due day. A
 * card with no statement day has no bill.
 */
export const cyclesFor = (d: Debt[], { moved, today }: CyclesForOptions) =>
	d
		.filter((c) => c.leaf && c.kind === 'card')
		.map((c) => cycleOf(c, { moved: moved.filter((m) => m.account === c.account), today }));

/** The leaf liabilities that do not say whether they are a card or a loan. */
export const unknownIn = (d: Debt[]) => d.filter((x) => x.leaf && x.kind === null);

const cycleOf = (card: Debt, { moved, today }: CyclesForOptions): Cycle => {
	const closed = card.statement === null ? null : lastOn(card.statement, today);
	const due = closed === null || card.due === null ? null : nextOn(card.due, closed);
	const since = closed === null ? [] : moved.filter((m) => isAfter(m.bucket, closed));

	const spent = sum(since.map((m) => m.outflow));
	const paid = sum(since.map((m) => m.inflow));
	const onTime =
		due === null ? paid : sum(since.filter((m) => !isAfter(m.bucket, due)).map((m) => m.inflow));
	const bill = closed === null ? null : ((card.owed - spent + paid) as Amount);

	return {
		account: card.account,
		owed: card.owed,
		limit: card.limit,
		closed,
		due,
		bill,
		spent: closed === null ? null : spent,
		paid: bill === null ? null : paidOf({ bill, paid, onTime, due, today }),
	};
};

type PaidOfOptions = {
	bill: Amount;
	paid: Amount;
	onTime: Amount;
	due: Temporal.PlainDate | null;
	today: Temporal.PlainDate;
};

const paidOf = ({ bill, paid, onTime, due, today }: PaidOfOptions): Paid => {
	if (bill <= ZERO) return 'none';
	if (onTime >= bill) return 'full';
	if (due === null || !isAfter(today, due)) return 'open';
	if (paid >= bill) return 'late';

	return paid > ZERO ? 'part' : 'unpaid';
};

/**
 * The last date on or before a day that falls on a day of the month, cut to the
 * month's end.
 */
const lastOn = (day: number, today: Temporal.PlainDate) => {
	const here = dayIn(today, day);
	return isAfter(here, today) ? dayIn(today.subtract({ months: 1 }), day) : here;
};

/**
 * The first date after a day that falls on a day of the month, cut to the
 * month's end.
 */
const nextOn = (day: number, after: Temporal.PlainDate) => {
	const here = dayIn(after, day);
	return isAfter(here, after) ? here : dayIn(after.add({ months: 1 }), day);
};

const dayIn = (m: Temporal.PlainDate, d: number) => m.with({ day: Math.min(d, m.daysInMonth) });

const isAfter = (x: Temporal.PlainDate, y: Temporal.PlainDate) =>
	Temporal.PlainDate.compare(x, y) > 0;
