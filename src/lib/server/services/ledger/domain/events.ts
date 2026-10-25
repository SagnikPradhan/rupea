import { fault, type RupeaError } from '#lib/server/shared/result/error.ts';
import { formatQuantity, sum } from './amounts';
import { displayLocation } from './parser';
import { accountType, BALANCE_TYPES } from './taxonomy';
import { type RupeaMetadata, type RupeaParseLocation, type RupeaPosting } from './types';

export enum EventRole {
	Primary = 'primary',
	Evidence = 'evidence',
}

/** The metadata key that links a transaction to an event in each role. */
export const EVENT_KEY: Record<EventRole, string> = {
	[EventRole.Primary]: 'event',
	[EventRole.Evidence]: 'same-as',
};

export const EVENT_KEYS = Object.values(EVENT_KEY);

export type EventMember = {
	id: string;
	location: RupeaParseLocation;
	metadata: RupeaMetadata;
	postings: RupeaPosting[];
};

export type EventCheck = { uncounted: string[]; failed: RupeaError[] };

export type EventLink = { event: string; role: EventRole };

/** A broken event counts all its members, so a mistake shows as a double count rather than as money gone missing. */
export const checkEvents = (transactions: EventMember[]): EventCheck => {
	const linked = transactions.map((t) => ({ transaction: t, links: linksOf(t.metadata) }));
	const tangled = linked.filter((l) => l.links.length > 1);
	const members = linked.flatMap((l) =>
		l.links.length === 1
			? l.links.map(({ event, role }) => ({ event, role, transaction: l.transaction }))
			: [],
	);

	const checked = Object.entries(Object.groupBy(members, (m) => m.event)).map(
		([event, group = []]) => checkEvent(event, group),
	);

	return {
		uncounted: checked.flatMap((c) => c.uncounted),
		failed: [
			...checked.flatMap((c) => c.failed),
			...tangled.map((l) =>
				fault('EventInvalidMembership', { location: displayLocations([l.transaction]) }),
			),
		],
	};
};

/** More than one link is a mistake `checkEvents` reports. */
export const linksOf = (m: RupeaMetadata): EventLink[] =>
	Object.values(EventRole).flatMap((r) =>
		(m[EVENT_KEY[r]] ?? []).map((e) => ({ event: e, role: r })),
	);

/** Each transaction marked with whether it counts, beside what `checkEvents` found. */
export const counted = <T extends EventMember>(transactions: T[]) => {
	const events = checkEvents(transactions);
	const uncounted = new Set(events.uncounted);

	return {
		...events,
		transactions: transactions.map((t) => ({ ...t, counted: !uncounted.has(t.id) })),
	};
};

const checkEvent = (
	event: string,
	members: { role: EventRole; transaction: EventMember }[],
): EventCheck => {
	const primaries = members.filter((m) => m.role === EventRole.Primary).map((m) => m.transaction);
	const evidence = members.filter((m) => m.role === EventRole.Evidence).map((m) => m.transaction);

	const [primary, ...others] = primaries;
	if (!primary) {
		const failed = fault('EventWithoutPrimary', {
			event,
			location: displayLocations(evidence),
		});
		return { uncounted: [], failed: [failed] };
	}
	if (others.length > 0) {
		const failed = fault('EventWithManyPrimaries', {
			event,
			location: displayLocations(primaries),
		});
		return { uncounted: [], failed: [failed] };
	}

	return {
		uncounted: evidence.map((e) => e.id),
		failed: evidence.flatMap((e) => disagreements(event, primary, e)),
	};
};

/** Only balance accounts both sides post to are compared; categories are guesses. */
const disagreements = (
	event: string,
	primary: EventMember,
	evidence: EventMember,
): RupeaError[] => {
	const expected = balances(primary);

	return balances(evidence).flatMap((actual) => {
		const differs = expected.find(
			(e) =>
				e.account === actual.account &&
				e.commodity === actual.commodity &&
				e.amount !== actual.amount,
		);
		if (!differs) return [];

		return [
			fault('EventDisagreement', {
				event,
				location: displayLocations([evidence]),
				account: actual.account,
				expected: formatQuantity(differs),
				actual: formatQuantity(actual),
			}),
		];
	});
};

const balances = (t: EventMember) => {
	const held = t.postings.filter((p) => BALANCE_TYPES.some((b) => b === accountType(p.account)));
	const groups = Object.values(Object.groupBy(held, (p) => `${p.account} ${p.commodity}`));

	return groups.flatMap((same = []) => {
		const [first] = same;
		if (!first) return [];

		const amount = sum(same.map((p) => p.amount));
		return [{ account: first.account, commodity: first.commodity, amount }];
	});
};

const displayLocations = (l: EventMember[]) => l.map((m) => displayLocation(m.location)).join(', ');
