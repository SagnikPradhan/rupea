import type { LedgerConfiguration } from '#lib/server/shared/context/config.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { batch } from '#lib/server/shared/result/batch.ts';
import { fault, type RupeeError } from '#lib/server/shared/result/error.ts';
import {
	err,
	errAsync,
	ok,
	okAsync,
	type Result,
	type ResultAsync,
	sequence,
} from '#lib/server/shared/result/result.ts';
import { index, type CandidatePair, type IndexedTransaction } from '../adapters/database';
import { counted, EventRole, linksOf } from '../domain/events';
import { insertLinks, rewriteLinks, type LinkEdit, type Relink } from '../domain/links';
import type { Ledger, RupeeFile, RupeeTransaction } from '../domain/types';
import { editFile, getFile } from './files';
import { syncIndex } from './sync';

type Candidates = { pairs: CandidatePair[]; transactions: IndexedTransaction[] };

// Pairs a file's transactions could form events with, and both sides of each.
export const findCandidates = (ledger: Ledger, key: string): ResultAsync<Candidates> =>
	index(ledger.id)
		.candidates(key)
		.andThen((c) =>
			index(ledger.id)
				.byIds([...new Set(c.flatMap((p) => [p.ours, p.theirs]))])
				.map((t) => ({ pairs: c, transactions: t })),
		);

export const isEventIdTaken = (l: Ledger, id: string): ResultAsync<boolean> =>
	index(l.id).eventIdTaken(id);

type EventMember = IndexedTransaction & { role: EventRole; counted: boolean };

export type FileEvent = { event: string; members: EventMember[] };

// Events with a member in the file, with every member wherever it is written.
export const eventsIn = (l: Ledger, k: string): ResultAsync<FileEvent[]> =>
	syncIndex(l)
		.andThen(() => index(l.id).eventsIn(k))
		.map(byEvent);

export const linkEvents = (ledger: Ledger, edits: LinkEdit[]): ResultAsync<RupeeError[]> =>
	rewriteFiles(
		ledger,
		Object.entries(Object.groupBy(edits, (e) => e.file)).map(([key, group = []]) => ({
			key,
			primary: group.some((e) => e.role === EventRole.Primary),
			write: (c, f) => insertLinks(c, f, group),
		})),
	);

export const renameEvent = (ledger: Ledger, event: string, to: string): ResultAsync<RupeeError[]> =>
	syncIndex(ledger)
		.andThen(() => isEventIdTaken(ledger, to))
		.andThen((t) =>
			t ? errAsync(fault('EventIdTaken', { event: to })) : index(ledger.id).membersOf(event),
		)
		.andThen((m) =>
			relinkFiles(ledger, { event, members: m, relink: (_, l) => ({ ...l, event: to }) }),
		);

type MakePrimaryOptions = { ledger: Ledger; event: string; file: string; line: number };

// The member becomes the one that counts; the old primary becomes evidence.
export const makePrimary = (options: MakePrimaryOptions): ResultAsync<RupeeError[]> => {
	const { ledger, event, file, line } = options;

	const isTarget = (t: RupeeTransaction) => t.location.file === file && t.location.line === line;
	const isPrimary = (t: IndexedTransaction) =>
		linksOf(t.metadata).some((l) => l.event === event && l.role === EventRole.Primary);
	const relink: Relink = (t, l) => ({
		...l,
		role: isTarget(t) ? EventRole.Primary : EventRole.Evidence,
	});

	return syncIndex(ledger)
		.andThen(() => index(ledger.id).membersOf(event))
		.andThen((m) =>
			m.some(isTarget)
				? okAsync(m)
				: errAsync(fault('EventStale', { location: `${file}:${line}` })),
		)
		.andThen((m) =>
			relinkFiles(ledger, { event, members: m.filter((t) => isTarget(t) || isPrimary(t)), relink }),
		);
};

type RelinkOptions = { event: string; members: IndexedTransaction[]; relink: Relink };

const relinkFiles = (ledger: Ledger, o: RelinkOptions): ResultAsync<RupeeError[]> => {
	const relinked = o.members.flatMap((t) =>
		linksOf(t.metadata)
			.filter((l) => l.event === o.event)
			.map((l) => ({ file: t.location.file, link: o.relink(t, l) })),
	);

	return rewriteFiles(
		ledger,
		Object.entries(Object.groupBy(relinked, (r) => r.file)).map(([key, group = []]) => ({
			key,
			primary: group.some((r) => r.link.role === EventRole.Primary),
			write: (c, f) => rewriteLinks(c, f, o.event, o.relink),
		})),
	);
};

type Rewrite = {
	key: string;
	primary: boolean;
	write: (c: LedgerConfiguration, f: RupeeFile) => Result<string>;
};

type Prepared = { file: RupeeFile; content: string; primary: boolean };

// Every file is prepared before any is written, and files gaining a primary
// go first, each only if unchanged since it was read. Writing stops at the
// first failure: a link then leaves at worst a primary without its evidence,
// while a rename or a new primary can leave a broken event for sync to report.
const rewriteFiles = (l: Ledger, rs: Rewrite[]): ResultAsync<RupeeError[]> =>
	sequence(rs.map((r) => () => prepare(l, r)))
		.map(batch)
		.andThen((b) => (b.failed.length > 0 ? okAsync(b.failed) : writeAll(l, b.succeeded)));

const prepare = (ledger: Ledger, r: Rewrite): ResultAsync<Result<Prepared>[]> =>
	getFile(ledger, r.key)
		.andThen((file) =>
			withContext('config')((c) => r.write(c.ledger, file)).map((content) => ({
				file,
				content,
				primary: r.primary,
			})),
		)
		.map((p) => [ok(p)])
		.orElse((e) => okAsync([err(e)]));

const writeAll = (ledger: Ledger, prepared: Prepared[]): ResultAsync<RupeeError[]> =>
	sequence(
		prepared
			.toSorted((a, b) => Number(b.primary) - Number(a.primary))
			.map((p) => () => write(ledger, p).map((): RupeeError[] => [])),
	).orElse((e) => ok([e]));

const write = (l: Ledger, p: Prepared): ResultAsync<RupeeFile> =>
	p.content === p.file.content
		? okAsync(p.file)
		: editFile({ ledger: l, key: p.file.key, content: p.content, version: p.file.version });

const byEvent = (transactions: IndexedTransaction[]): FileEvent[] => {
	const members = counted(transactions).transactions.flatMap((t) =>
		linksOf(t.metadata).map((l) => ({ event: l.event, member: { ...t, role: l.role } })),
	);

	return Object.entries(Object.groupBy(members, (m) => m.event)).map(([event, group = []]) => ({
		event,
		members: group.map((m) => m.member),
	}));
};
