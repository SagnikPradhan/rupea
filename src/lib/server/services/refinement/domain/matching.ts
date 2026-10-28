import { sha256 } from '#lib/server/shared/hash.ts';
import { byCodeUnit } from '#lib/server/shared/text.ts';
import {
	GroupRole,
	formatQuantity,
	linksOf,
	type LinkEdit,
	type RupeaTransaction,
} from '#services/ledger/application/shared.ts';

export enum Confidence {
	Duplicate = 'duplicate',
	Possible = 'possible',
}

export type MatchedTransaction = RupeaTransaction & { id: string };

export type CandidatePair = { ours: string; theirs: string };

// Where a link line goes, and what the header there must still say.
export type LinkTarget = Omit<LinkEdit, 'group'>;

// `group` is null until a new group is named.
export type Suggestion = {
	fingerprint: string;
	confidence: Confidence;
	group: string | null;
	ours: MatchedTransaction;
	theirs: MatchedTransaction;
	links: LinkTarget[];
};

type SuggestOptions = {
	pairs: CandidatePair[];
	transactions: MatchedTransaction[];
	dismissed: Set<string>;
};

// Each transaction joins at most one suggestion, the strongest first, so two
// identical charges pair off one to one.
export const suggest = (options: SuggestOptions): Suggestion[] => {
	const byId = Object.fromEntries(options.transactions.map((t) => [t.id, t]));
	const scored = options.pairs
		.flatMap((p) => score(byId[p.ours], byId[p.theirs]))
		.filter((c) => !options.dismissed.has(c.fingerprint))
		.sort(strongestFirst);

	// A group never takes a second member from the file being refined.
	const ourGroups = new Set(scored.flatMap((c) => linksOf(c.ours.metadata).map((l) => l.group)));
	const used = new Set<string>();

	return scored.flatMap((c) => {
		const s = link(c, ourGroups);
		if (!s || used.has(c.ours.id) || used.has(c.theirs.id)) return [];

		used.add(c.ours.id);
		used.add(c.theirs.id);
		return [s];
	});
};

type Scored = Omit<Suggestion, 'group' | 'links'>;

const score = (
	ours: MatchedTransaction | undefined,
	theirs: MatchedTransaction | undefined,
): Scored[] => {
	if (!ours || !theirs) return [];

	const same = normalise(ours.description) === normalise(theirs.description);
	return [
		{
			fingerprint: fingerprint(ours, theirs),
			confidence: same ? Confidence.Duplicate : Confidence.Possible,
			ours,
			theirs,
		},
	];
};

const strongestFirst = (a: Scored, b: Scored) =>
	Number(b.confidence === Confidence.Duplicate) - Number(a.confidence === Confidence.Duplicate) ||
	a.ours.location.line - b.ours.location.line ||
	a.theirs.location.file.localeCompare(b.theirs.location.file) ||
	a.theirs.location.line - b.theirs.location.line;

// Joins an existing group when one side has it; otherwise the side with more
// postings is the primary, and on a tie the one being refined, as the latest.
const link = (c: Scored, ourGroups: Set<string>): Suggestion | null => {
	const ourLinks = linksOf(c.ours.metadata);
	const theirLinks = linksOf(c.theirs.metadata);
	if (ourLinks.length + theirLinks.length > 1) return null;

	const [ourLink] = ourLinks;
	const [theirLink] = theirLinks;
	if (theirLink && ourGroups.has(theirLink.group)) return null;
	if (theirLink)
		return { ...c, group: theirLink.group, links: [target(c.ours, GroupRole.Evidence)] };
	if (ourLink) return { ...c, group: ourLink.group, links: [target(c.theirs, GroupRole.Evidence)] };

	const [primary, evidence] =
		c.theirs.postings.length > c.ours.postings.length ? [c.theirs, c.ours] : [c.ours, c.theirs];
	return {
		...c,
		group: null,
		links: [target(primary, GroupRole.Primary), target(evidence, GroupRole.Evidence)],
	};
};

const target = (t: MatchedTransaction, role: GroupRole): LinkTarget => ({
	file: t.location.file,
	line: t.location.line,
	date: t.date.toString(),
	description: t.description,
	role,
});

// Changes when either side does, so a dismissal lapses with an edit. The
// location tells identical charges apart.
export const fingerprint = (a: RupeaTransaction, b: RupeaTransaction): string =>
	sha256([identity(a), identity(b)].toSorted(byCodeUnit).join('\n'));

const identity = (t: RupeaTransaction) =>
	[
		`${t.location.file}:${t.location.line}`,
		t.date.toString(),
		t.description,
		...t.postings.map((p) => `${p.account} ${formatQuantity(p)}`).toSorted(byCodeUnit),
	].join('|');

const normalise = (d: string) => d.toLowerCase().replace(/\s+/g, ' ').trim();
