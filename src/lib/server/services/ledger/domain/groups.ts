import { fault, type RupeaError } from '#lib/server/shared/result/error.ts';
import { formatQuantity, sum } from './amounts';
import { displayLocation } from './parser';
import { accountType, BALANCE_TYPES } from './taxonomy';
import { type RupeaMetadata, type RupeaParseLocation, type RupeaPosting } from './types';

export enum GroupRole {
	Primary = 'primary',
	Evidence = 'evidence',
}

/** The metadata key that links a transaction to a group in each role. */
export const GROUP_KEY: Record<GroupRole, string> = {
	[GroupRole.Primary]: 'group',
	[GroupRole.Evidence]: 'same-as',
};

export const GROUP_KEYS = Object.values(GROUP_KEY);

export type GroupMember = {
	id: string;
	location: RupeaParseLocation;
	metadata: RupeaMetadata;
	postings: RupeaPosting[];
};

export type GroupCheck = { uncounted: string[]; failed: RupeaError[] };

export type GroupLink = { group: string; role: GroupRole };

/** A broken group counts all its members, so a mistake shows as a double count rather than as money gone missing. */
export const checkGroups = (transactions: GroupMember[]): GroupCheck => {
	const linked = transactions.map((t) => ({ transaction: t, links: linksOf(t.metadata) }));
	const tangled = linked.filter((l) => l.links.length > 1);
	const members = linked.flatMap((l) =>
		l.links.length === 1
			? l.links.map(({ group, role }) => ({ group, role, transaction: l.transaction }))
			: [],
	);

	const checked = Object.entries(Object.groupBy(members, (m) => m.group)).map(
		([group, linked = []]) => checkGroup(group, linked),
	);

	return {
		uncounted: checked.flatMap((c) => c.uncounted),
		failed: [
			...checked.flatMap((c) => c.failed),
			...tangled.map((l) =>
				fault('GroupInvalidMembership', { location: displayLocations([l.transaction]) }),
			),
		],
	};
};

/** More than one link is a mistake `checkGroups` reports. */
export const linksOf = (m: RupeaMetadata): GroupLink[] =>
	Object.values(GroupRole).flatMap((r) =>
		(m[GROUP_KEY[r]] ?? []).map((e) => ({ group: e, role: r })),
	);

/** Each transaction marked with whether it counts, beside what `checkGroups` found. */
export const counted = <T extends GroupMember>(transactions: T[]) => {
	const groups = checkGroups(transactions);
	const uncounted = new Set(groups.uncounted);

	return {
		...groups,
		transactions: transactions.map((t) => ({ ...t, counted: !uncounted.has(t.id) })),
	};
};

const checkGroup = (
	group: string,
	members: { role: GroupRole; transaction: GroupMember }[],
): GroupCheck => {
	const primaries = members.filter((m) => m.role === GroupRole.Primary).map((m) => m.transaction);
	const evidence = members.filter((m) => m.role === GroupRole.Evidence).map((m) => m.transaction);

	const [primary, ...others] = primaries;
	if (!primary) {
		const failed = fault('GroupWithoutPrimary', {
			group,
			location: displayLocations(evidence),
		});
		return { uncounted: [], failed: [failed] };
	}
	if (others.length > 0) {
		const failed = fault('GroupWithManyPrimaries', {
			group,
			location: displayLocations(primaries),
		});
		return { uncounted: [], failed: [failed] };
	}

	return {
		uncounted: evidence.map((e) => e.id),
		failed: evidence.flatMap((e) => disagreements(group, primary, e)),
	};
};

/** Only balance accounts both sides post to are compared; categories are guesses. */
const disagreements = (
	group: string,
	primary: GroupMember,
	evidence: GroupMember,
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
			fault('GroupDisagreement', {
				group,
				location: displayLocations([evidence]),
				account: actual.account,
				expected: formatQuantity(differs),
				actual: formatQuantity(actual),
			}),
		];
	});
};

const balances = (t: GroupMember) => {
	const held = t.postings.filter((p) => BALANCE_TYPES.some((b) => b === accountType(p.account)));
	const groups = Object.values(Object.groupBy(held, (p) => `${p.account} ${p.commodity}`));

	return groups.flatMap((same = []) => {
		const [first] = same;
		if (!first) return [];

		const amount = sum(same.map((p) => p.amount));
		return [{ account: first.account, commodity: first.commodity, amount }];
	});
};

const displayLocations = (l: GroupMember[]) => l.map((m) => displayLocation(m.location)).join(', ');
