import {
	EventRole,
	formatQuantity,
	linksOf,
	type RupeeTransaction,
} from '#services/ledger/application/shared.ts';
import { createHash } from 'node:crypto';

export enum Confidence {
	Duplicate = 'duplicate',
	Possible = 'possible',
}

export type MatchedTransaction = RupeeTransaction & { id: string };

export type CandidatePair = { ours: string; theirs: string };

// Where a link line goes, and what the header there must still say.
export type LinkTarget = {
	file: string;
	line: number;
	date: string;
	description: string;
	role: EventRole;
};

// `event` is null until a new event is named.
export type Suggestion = {
	fingerprint: string;
	confidence: Confidence;
	event: string | null;
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
	// An event never takes a second member from the file being refined.
	const ourEvents = new Set(scored.flatMap((c) => linksOf(c.ours).map((l) => l.event)));
	const used = new Set<string>();

	return scored.flatMap((c) => {
		const s = link(c, ourEvents);
		if (!s || used.has(c.ours.id) || used.has(c.theirs.id)) return [];

		used.add(c.ours.id);
		used.add(c.theirs.id);
		return [s];
	});
};

type Scored = Omit<Suggestion, 'event' | 'links'>;

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

// Joins an existing event when one side has it; otherwise the side with more
// postings is the primary, and on a tie the one being refined, as the latest.
const link = (c: Scored, ourEvents: Set<string>): Suggestion | null => {
	const ourLinks = linksOf(c.ours);
	const theirLinks = linksOf(c.theirs);
	if (ourLinks.length + theirLinks.length > 1) return null;

	const [ourLink] = ourLinks;
	const [theirLink] = theirLinks;
	if (theirLink && ourEvents.has(theirLink.event)) return null;
	if (theirLink)
		return { ...c, event: theirLink.event, links: [target(c.ours, EventRole.Evidence)] };
	if (ourLink) return { ...c, event: ourLink.event, links: [target(c.theirs, EventRole.Evidence)] };

	const [primary, evidence] =
		c.theirs.postings.length > c.ours.postings.length ? [c.theirs, c.ours] : [c.ours, c.theirs];
	return {
		...c,
		event: null,
		links: [target(primary, EventRole.Primary), target(evidence, EventRole.Evidence)],
	};
};

const target = (t: MatchedTransaction, role: EventRole): LinkTarget => ({
	file: t.location.file,
	line: t.location.line,
	date: t.date.toString(),
	description: t.description,
	role,
});

// Changes when either side does, so a dismissal lapses with an edit. The
// location tells identical charges apart.
export const fingerprint = (a: RupeeTransaction, b: RupeeTransaction): string =>
	createHash('sha256')
		.update([identity(a), identity(b)].sort().join('\n'))
		.digest('hex');

const identity = (t: RupeeTransaction) =>
	[
		`${t.location.file}:${t.location.line}`,
		t.date.toString(),
		t.description,
		...t.postings.map((p) => `${p.account} ${formatQuantity(p)}`).sort(),
	].join('|');

const normalise = (d: string) => d.toLowerCase().replace(/\s+/g, ' ').trim();
