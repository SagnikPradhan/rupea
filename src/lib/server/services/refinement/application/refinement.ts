import type { RupeeConfiguration } from '#lib/server/shared/config.ts';
import { withContext } from '#lib/server/shared/context.ts';
import type { RupeeError } from '#lib/server/shared/error.ts';
import {
	batch,
	concat,
	err,
	errAsync,
	ok,
	okAsync,
	type Result,
	type ResultAsync,
} from '#lib/server/shared/result.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import {
	checkEvents,
	EventRole,
	linksOf,
	type RupeeFile,
	type RupeeTransaction,
} from '#services/ledger/application/shared.ts';
import { dismissals } from '../adapters/database';
import { insertLinks, rewriteLinks, type LinkEdit, type Relink } from '../domain/edits';
import { eventId } from '../domain/ids';
import { suggest, type Suggestion } from '../domain/matching';

export type { LinkEdit, Suggestion };

// A random word clashes rarely enough that a few tries settle it.
const TRIES = 5;

// Runs after a file is saved, and on request: only that file's transactions
// look for partners, so the work grows with the file, not the ledger.
export const suggestFor = (ledger: Ledger.Ledger, key: string): ResultAsync<Suggestion[]> =>
	Ledger.syncIndex(ledger)
		.andThen(() => Ledger.findCandidates(ledger, key))
		.andThen((c) =>
			dismissals(ledger.id)
				.all()
				.map((d) => suggest({ ...c, dismissed: d })),
		)
		.andThen((s) => named(ledger, s));

// One at a time, so two new events in a batch never get the same name.
const named = (ledger: Ledger.Ledger, suggestions: Suggestion[]): ResultAsync<Suggestion[]> =>
	suggestions.reduce<ResultAsync<Suggestion[]>>(
		(r, s) =>
			r.andThen((d) =>
				(s.event === null ? fresh(ledger, s, d, TRIES) : okAsync(s)).map((n) => [...d, n]),
			),
		okAsync([]),
	);

const fresh = (
	ledger: Ledger.Ledger,
	suggestion: Suggestion,
	done: Suggestion[],
	tries: number,
): ResultAsync<Suggestion> => {
	const primary = suggestion.links.find((l) => l.role === EventRole.Primary) ?? suggestion.links[0];
	const id = eventId({
		date: primary?.date ?? '',
		description: primary?.description ?? '',
	});
	const retry = () =>
		tries > 1
			? fresh(ledger, suggestion, done, tries - 1)
			: errAsync<Suggestion, RupeeError>({ type: 'RefinementNameTaken', event: id, cause: [] });
	if (done.some((d) => d.event === id)) return retry();

	return Ledger.isEventIdTaken(ledger, id).andThen((t) =>
		t ? retry() : okAsync({ ...suggestion, event: id }),
	);
};

// Every file is checked before any is written, and files holding a primary go
// first, each only if unchanged since it was read. Writing stops at the first
// failure, which leaves at worst a primary still without its evidence: a whole
// event, never evidence without its primary.
export const accept = (ledger: Ledger.Ledger, edits: LinkEdit[]): ResultAsync<RupeeError[]> =>
	concat<Result<Linked>>(
		Object.entries(Object.groupBy(edits, (e) => e.file)).map(
			([key, group = []]) =>
				() =>
					linked(ledger, key, group)
						.map((l) => [ok(l)])
						.orElse((e) => okAsync([err(e)])),
		),
	)
		.map(batch)
		.andThen((b) => (b.failed.length > 0 ? okAsync(b.failed) : writeLinked(ledger, b.succeeded)));

type Linked = { file: RupeeFile; content: string; primary: boolean };

const linked = (ledger: Ledger.Ledger, key: string, edits: LinkEdit[]): ResultAsync<Linked> =>
	Ledger.getFile(ledger, key).andThen((file) =>
		withContext('config')((c) => insertLinks(c, file, edits)).map((content) => ({
			file,
			content,
			primary: edits.some((e) => e.role === EventRole.Primary),
		})),
	);

const writeLinked = (ledger: Ledger.Ledger, linked: Linked[]): ResultAsync<RupeeError[]> =>
	concat(
		linked
			.toSorted((a, b) => Number(b.primary) - Number(a.primary))
			.map((l) => () => writeLinks(ledger, l).map((): RupeeError[] => [])),
	).orElse((e) => ok([e]));

const writeLinks = (ledger: Ledger.Ledger, l: Linked): ResultAsync<RupeeFile> => {
	const file = l.file;
	return l.content === file.content
		? okAsync(file)
		: Ledger.editFile({ ledger, key: file.key, content: l.content, version: file.version });
};

type LinkWriter = (c: RupeeConfiguration, f: RupeeFile) => Result<string>;

const editLinks = (
	ledger: Ledger.Ledger,
	key: string,
	write: LinkWriter,
): ResultAsync<RupeeError[]> =>
	Ledger.getFile(ledger, key)
		.andThen((f) =>
			withContext('config')((c) => write(c, f)).asyncAndThen((t) =>
				t === f.content
					? okAsync(f)
					: Ledger.editFile({ ledger, key, content: t, version: f.version }),
			),
		)
		.map((): RupeeError[] => []);

export const dismiss = (l: Ledger.Ledger, f: string): ResultAsync<void> => dismissals(l.id).add(f);

export type EventMember = Ledger.IndexedTransaction & { role: EventRole; counted: boolean };

export type FileEvent = { event: string; members: EventMember[] };

// Events with a member in the file, with every member wherever it is written.
export const eventsIn = (l: Ledger.Ledger, k: string): ResultAsync<FileEvent[]> =>
	Ledger.syncIndex(l)
		.andThen(() => Ledger.findEventsIn(l, k))
		.map(grouped);

const grouped = (transactions: Ledger.IndexedTransaction[]): FileEvent[] => {
	const evidence = new Set(checkEvents(transactions).evidence);
	const members = transactions.flatMap((t) =>
		linksOf(t).map((l) => ({
			event: l.event,
			member: { ...t, role: l.role, counted: !evidence.has(t.id) },
		})),
	);

	return Object.entries(Object.groupBy(members, (m) => m.event)).map(([event, group = []]) => ({
		event,
		members: group.map((m) => m.member),
	}));
};

export const renameEvent = (
	ledger: Ledger.Ledger,
	event: string,
	to: string,
): ResultAsync<RupeeError[]> =>
	Ledger.syncIndex(ledger)
		.andThen(() => Ledger.isEventIdTaken(ledger, to))
		.andThen((t) =>
			t
				? errAsync<Ledger.IndexedTransaction[], RupeeError>({
						type: 'RefinementNameTaken',
						event: to,
						cause: [],
					})
				: Ledger.findEventMembers(ledger, event),
		)
		.andThen((m) => relinkFiles(ledger, m, event, (_, l) => ({ ...l, event: to })));

type MakePrimaryOptions = { ledger: Ledger.Ledger; event: string; file: string; line: number };

// The member becomes the one that counts; the old primary becomes evidence.
export const makePrimary = (options: MakePrimaryOptions): ResultAsync<RupeeError[]> => {
	const { ledger, event, file, line } = options;
	const isTarget = (t: RupeeTransaction) => t.location.file === file && t.location.line === line;
	const isPrimary = (t: Ledger.IndexedTransaction) =>
		linksOf(t).some((l) => l.event === event && l.role === EventRole.Primary);

	return Ledger.syncIndex(ledger)
		.andThen(() => Ledger.findEventMembers(ledger, event))
		.andThen((m) =>
			m.some(isTarget)
				? relinkFiles(
						ledger,
						m.filter((t) => isTarget(t) || isPrimary(t)),
						event,
						(t, l) => ({ ...l, role: isTarget(t) ? EventRole.Primary : EventRole.Evidence }),
					)
				: errAsync<RupeeError[], RupeeError>({
						type: 'RefinementStale',
						location: `${file}:${line}`,
						cause: [],
					}),
		);
};

// File by file, like `accept`: a file that fails is reported, the rest go ahead.
const relinkFiles = (
	ledger: Ledger.Ledger,
	members: Ledger.IndexedTransaction[],
	event: string,
	relink: Relink,
): ResultAsync<RupeeError[]> =>
	concat(
		[...new Set(members.map((m) => m.location.file))].map(
			(key) => () =>
				editLinks(ledger, key, (c, f) => rewriteLinks(c, f, event, relink)).orElse((err) =>
					ok([err]),
				),
		),
	);
