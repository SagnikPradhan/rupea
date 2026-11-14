import { AmountOut, QuantityOut, PostedOut } from '@rupea/shared/money.ts';
import { Day, DayOut, TimeOut } from '@rupea/shared/dates.ts';
import { Key, Line } from '@rupea/shared/files.ts';
import { Handle } from '@rupea/shared/text.ts';
import { TermsOut } from '@rupea/shared/forms.ts';
import * as v from 'valibot';

export const Location = v.object({ file: v.string(), line: v.number() });

export const AccountRow = v.object({
	account: v.string(),
	parent: v.nullable(v.string()),
	posted: v.boolean(),
});

export const Lot = v.object({
	location: Location,
	date: DayOut,
	origin: v.picklist(['buy', 'transfer', 'short', 'unpriced']),
	from: v.nullable(v.string()),
	units: AmountOut,
	remaining: AmountOut,
	cost: QuantityOut,
	disposals: v.array(
		v.object({
			location: Location,
			date: DayOut,
			kind: v.picklist(['sale', 'transfer', 'gift', 'cover']),
			units: AmountOut,
			price: v.nullable(QuantityOut),
			gain: v.nullable(QuantityOut),
		}),
	),
});

export const Balances = v.object({
	from: DayOut,
	to: DayOut,
	base: v.string(),
	rows: v.array(
		v.object({
			account: v.string(),
			commodity: v.nullable(v.string()),
			bucket: v.string(),
			unpriced: v.number(),
			value: v.optional(AmountOut),
			inflow: v.optional(AmountOut),
			outflow: v.optional(AmountOut),
			units: v.optional(AmountOut),
			cost: v.optional(AmountOut),
			paid: v.optional(AmountOut),
			price: v.optional(QuantityOut),
		}),
	),
});

export const Spanned = v.object({ handle: Handle, from: Day, to: Day });

export const Drops = v.object({
	underwater: v.array(v.object({ day: DayOut, depth: v.number() })),
	lows: v.array(v.object({ account: v.string(), depth: v.number(), day: DayOut })),
	swings: v.array(v.object({ account: v.string(), swing: v.number() })),
});

export const Bridge = v.object({
	from: DayOut,
	to: DayOut,
	start: AmountOut,
	income: AmountOut,
	expenses: AmountOut,
	shifts: v.array(v.object({ account: v.string(), amount: AmountOut })),
	other: AmountOut,
	end: AmountOut,
});

export const Returns = v.object({
	account: v.string(),
	netIn: AmountOut,
	xirr: v.nullable(v.number()),
	yearly: v.boolean(),
});

export const Held = v.object({
	account: v.string(),
	current: v.record(v.string(), v.string()),
	held: v.nullable(TermsOut),
});

/** A transaction as a file holds it, with where it stands. */
export const TransactionOut = v.object({
	file: v.string(),
	line: v.number(),
	date: DayOut,
	time: v.nullable(TimeOut),
	description: v.string(),
	comment: v.nullable(v.string()),
	postings: v.array(v.object({ account: v.string(), quantity: PostedOut })),
});

/** Whether a member of a group counts, or only backs up the one that does. */
export const Role = v.picklist(['primary', 'evidence']);

/** A group's name is one word. */
export const GroupId = v.pipe(
	v.string(),
	v.regex(/^\S+$/, 'A group id is one word.'),
	v.maxLength(256),
);

/** What a suggestion is known by, so a dismissal can name it. */
export const Fingerprint = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/));

/** Where a link line goes, and what the header there must still say. */
export const LinkTarget = v.object({
	file: Key,
	line: Line,
	date: v.string(),
	description: v.string(),
	role: Role,
});

/** The most link lines one call writes. */
export const MOST_EDITS = 10_000;

/** A link line to write, naming the group it joins. */
export const LinkEdit = v.object({ ...LinkTarget.entries, group: GroupId });

export const Suggestion = v.object({
	fingerprint: v.string(),
	confidence: v.picklist(['duplicate', 'possible']),
	group: v.nullable(v.string()),
	ours: TransactionOut,
	theirs: TransactionOut,
	links: v.array(LinkTarget),
});

export const Group = v.object({
	group: v.string(),
	members: v.array(v.object({ role: Role, counted: v.boolean(), ...TransactionOut.entries })),
});

export const Filter = {
	handle: Handle,
	from: Day,
	to: Day,
	account: v.optional(v.string()),
	description: v.optional(v.string()),
};

export const Cursor = v.object({
	date: v.pipe(v.string(), v.isoDate()),
	time: v.pipe(v.string(), v.isoTimeSecond()),
	id: v.pipe(v.string(), v.uuid()),
});

/** A query string carries the position as text. */
export const PostingCursor = v.object({
	...Cursor.entries,
	position: v.union([v.number(), v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number))]),
});

export const PostedCursor = v.object({ ...Cursor.entries, position: v.number() });

export const Transaction = v.object({
	id: v.string(),
	counted: v.boolean(),
	...TransactionOut.entries,
});

export const Posting = v.object({
	transaction: v.string(),
	position: v.number(),
	file: v.string(),
	line: v.number(),
	date: DayOut,
	description: v.string(),
	account: v.string(),
	quantity: PostedOut,
});
