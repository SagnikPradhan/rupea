import { AmountOut, QuantityOut } from '@rupea/shared/amounts.ts';
import { Bucket, DayOut } from '@rupea/shared/dates.ts';
import { LinkTarget, Role } from '@rupea/shared/groups.ts';
import { PostedOut } from '@rupea/shared/quantities.ts';
import { TransactionOut } from '@rupea/shared/transactions.ts';
import * as v from 'valibot';

const Location = v.object({ file: v.string(), line: v.number() });

const Holding = v.object({
	commodity: v.string(),
	hasLots: v.boolean(),
	units: AmountOut,
	price: v.nullable(QuantityOut),
	value: v.nullable(AmountOut),
	paid: v.nullable(AmountOut),
	gain: v.nullable(AmountOut),
});

export const Account = v.object({
	account: v.string(),
	parent: v.nullable(v.string()),
	holdings: v.array(Holding),
	total: AmountOut,
	cost: v.nullable(AmountOut),
	gain: v.nullable(AmountOut),
	unpriced: v.number(),
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

const Flow = {
	amount: AmountOut,
	inflow: AmountOut,
	outflow: AmountOut,
	unpriced: v.number(),
};

export const Deltas = v.object({
	from: DayOut,
	to: DayOut,
	bucket: Bucket,
	buckets: v.array(DayOut),
	totals: v.array(v.object({ account: v.string(), parent: v.nullable(v.string()), ...Flow })),
	deltas: v.array(v.object({ account: v.string(), bucket: DayOut, ...Flow })),
});
