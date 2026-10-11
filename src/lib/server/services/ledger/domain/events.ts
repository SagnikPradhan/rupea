import type { RupeeError } from '#lib/server/shared/error.ts';
import { batch, err, ok, type Result } from '#lib/server/shared/result.ts';
import { displayLocation } from './parser';
import {
	accountType,
	AccountType,
	formatQuantity,
	type Amount,
	type Quantity,
	type RupeeTransaction,
} from './types';

export enum EventRole {
	Primary = 'primary',
	Evidence = 'evidence',
}

const ROLES: Record<string, EventRole> = {
	event: EventRole.Primary,
	'same-as': EventRole.Evidence,
};

export const EVENT_KEYS = Object.keys(ROLES);

export const EVENT_KEY: Record<EventRole, string> = {
	[EventRole.Primary]: 'event',
	[EventRole.Evidence]: 'same-as',
};

// Where real money sits; Income and Expenses only say what it was for.
export const BALANCE_TYPES = [AccountType.Assets, AccountType.Liabilities];

export type EventMember = Pick<RupeeTransaction, 'location' | 'metadata' | 'postings'> & {
	id: string;
};

// `evidence` holds the ids of members that are not counted.
export type EventCheck = { evidence: string[]; failed: RupeeError[] };

// A broken event counts all its members, so a mistake shows as a double count
// rather than as money gone missing.
export const checkEvents = (transactions: EventMember[]): EventCheck => {
	const memberships = batch(transactions.map(membership));
	const members = memberships.succeeded.flatMap((m) => (m ? [m] : []));
	const checked = Object.entries(Object.groupBy(members, (m) => m.event)).map(
		([event, group = []]) => checkEvent(event, group),
	);

	return {
		evidence: checked.flatMap((c) => c.evidence),
		failed: [...memberships.failed, ...checked.flatMap((c) => c.failed)],
	};
};

export type EventLink = { event: string; role: EventRole };

// More than one link is a mistake `checkEvents` reports.
export const linksOf = (t: Pick<RupeeTransaction, 'metadata'>): EventLink[] =>
	Object.entries(ROLES).flatMap(([key, role]) =>
		(t.metadata[key] ?? []).map((e) => ({ event: e, role })),
	);

type Membership = EventLink & { member: EventMember };

const membership = (t: EventMember): Result<Membership | null> => {
	const [only, ...rest] = linksOf(t);
	if (!only) return ok(null);
	if (rest.length > 0) return err({ type: 'EventInvalidMembership', location: at(t), cause: [] });

	return ok({ ...only, member: t });
};

const checkEvent = (event: string, members: Membership[]): EventCheck => {
	const [primary, ...others] = members.filter((m) => m.role === EventRole.Primary);
	if (!primary) return broken('EventWithoutPrimary', event, members);
	if (others.length > 0) return broken('EventWithManyPrimaries', event, [primary, ...others]);

	const evidence = members.filter((m) => m.role === EventRole.Evidence).map((m) => m.member);
	return {
		evidence: evidence.map((e) => e.id),
		failed: evidence.flatMap((e) => disagreements(event, primary.member, e)),
	};
};

const broken = (
	type: 'EventWithoutPrimary' | 'EventWithManyPrimaries',
	event: string,
	members: Membership[],
): EventCheck => ({
	evidence: [],
	failed: [{ type, event, location: members.map((m) => at(m.member)).join(', '), cause: [] }],
});

// Only balance accounts both sides post to are compared; categories are guesses.
const disagreements = (
	event: string,
	primary: EventMember,
	evidence: EventMember,
): RupeeError[] => {
	const expected = balances(primary);

	return balances(evidence).flatMap((q) => {
		const wanted = expected.find((e) => e.account === q.account && e.commodity === q.commodity);
		if (wanted === undefined || wanted.amount === q.amount) return [];

		return [
			{
				type: 'EventDisagreement' as const,
				event,
				location: at(evidence),
				account: q.account,
				expected: formatQuantity(wanted),
				actual: formatQuantity(q),
				cause: [],
			},
		];
	});
};

type Holding = Quantity & { account: string };

const balances = (t: EventMember): Holding[] =>
	Object.values(
		Object.groupBy(
			t.postings.filter((p) => BALANCE_TYPES.some((r) => r === accountType(p.account))),
			(p) => `${p.account} ${p.commodity}`,
		),
	).flatMap(([first, ...rest] = []) =>
		first
			? [
					{
						account: first.account,
						commodity: first.commodity,
						amount: [first, ...rest].reduce((s, p) => s + p.amount, 0n) as Amount,
					},
				]
			: [],
	);

const at = (t: EventMember) => displayLocation(t.location);
