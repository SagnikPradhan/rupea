import type { LedgerConfiguration } from '#lib/server/shared/context/config.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { batchInOrder } from '#lib/server/shared/result/batch.ts';
import { fault, type RupeeError } from '#lib/server/shared/result/error.ts';
import {
	errAsync,
	inOrder,
	ok,
	okAsync,
	type Result,
	type ResultAsync,
} from '#lib/server/shared/result/result.ts';
import * as DB from '../adapters/database';
import { counted, EventRole, linksOf } from '../domain/events';
import { insertLinks, rewriteLinks, type LinkEdit, type Relink } from '../domain/links';
import type { Ledger, RupeeFile, RupeeTransaction } from '../domain/types';
import { editFile, readFile } from './files';
import { syncIndex } from './sync';

type Candidates = { pairs: DB.CandidatePair[]; transactions: DB.IndexedTransaction[] };

type EventMember = DB.IndexedTransaction & { role: EventRole; counted: boolean };

export type FileEvent = { event: string; members: EventMember[] };

type InFileOptions = { ledger: Ledger; file: string };

// Pairs a file's transactions could form events with, and both sides of each.
export const listCandidates = ({ ledger, file }: InFileOptions): ResultAsync<Candidates> =>
	DB.listCandidates(ledger.id, file).andThen((pairs) => {
		const ids = [...new Set(pairs.flatMap((p) => [p.ours, p.theirs]))];
		return DB.findTransactions(ledger.id, ids).map((t) => ({ pairs, transactions: t }));
	});

type IsEventIdTakenOptions = { ledger: Ledger; id: string };

export const isEventIdTaken = ({ ledger, id }: IsEventIdTakenOptions): ResultAsync<boolean> =>
	DB.isEventIdTaken(ledger.id, id);

// Events with a member in the file, with every member wherever it is written.
export const listEvents = ({ ledger, file }: InFileOptions): ResultAsync<FileEvent[]> =>
	syncIndex(ledger)
		.andThen(() => DB.listEventsInFile(ledger.id, file))
		.map(byEvent);

type LinkEventsOptions = { ledger: Ledger; edits: LinkEdit[] };

export const linkEvents = ({ ledger, edits }: LinkEventsOptions): ResultAsync<RupeeError[]> =>
	rewriteFiles(
		ledger,
		Object.entries(Object.groupBy(edits, (e) => e.file)).map(([key, group = []]) => ({
			key,
			primary: group.some((e) => e.role === EventRole.Primary),
			write: (c, f) => insertLinks(c, f, group),
		})),
	);

type RenameEventOptions = { ledger: Ledger; event: string; to: string };

export const renameEvent = ({ ledger, event, to }: RenameEventOptions): ResultAsync<RupeeError[]> =>
	syncIndex(ledger)
		.andThen(() => DB.isEventIdTaken(ledger.id, to))
		.andThen((t) =>
			t ? errAsync(fault('EventIdTaken', { event: to })) : DB.listEventMembers(ledger.id, event),
		)
		.andThen((m) =>
			relinkFiles(ledger, { event, members: m, relink: (_, l) => ({ ...l, event: to }) }),
		);

type MakePrimaryOptions = { ledger: Ledger; event: string; file: string; line: number };

// The member becomes the one that counts; the old primary becomes evidence.
export const makePrimary = ({
	ledger,
	event,
	file,
	line,
}: MakePrimaryOptions): ResultAsync<RupeeError[]> => {
	const isTarget = (t: RupeeTransaction) => t.location.file === file && t.location.line === line;
	const isPrimary = (t: DB.IndexedTransaction) =>
		linksOf(t.metadata).some((l) => l.event === event && l.role === EventRole.Primary);
	const relink: Relink = (t, l) => ({
		...l,
		role: isTarget(t) ? EventRole.Primary : EventRole.Evidence,
	});

	return syncIndex(ledger)
		.andThen(() => DB.listEventMembers(ledger.id, event))
		.andThen((m) =>
			m.some(isTarget)
				? okAsync(m)
				: errAsync(fault('EventStale', { location: `${file}:${line}` })),
		)
		.andThen((m) =>
			relinkFiles(ledger, { event, members: m.filter((t) => isTarget(t) || isPrimary(t)), relink }),
		);
};

type RelinkOptions = { event: string; members: DB.IndexedTransaction[]; relink: Relink };

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
	batchInOrder(rs.map((r) => () => prepare(l, r))).andThen((b) =>
		b.failed.length > 0 ? okAsync(b.failed) : writeAll(l, b.succeeded),
	);

const prepare = (ledger: Ledger, r: Rewrite): ResultAsync<Prepared> =>
	readFile({ ledger, key: r.key }).andThen((file) =>
		withContext('config')((c) => r.write(c.ledger, file)).map((content) => ({
			file,
			content,
			primary: r.primary,
		})),
	);

const writeAll = (ledger: Ledger, prepared: Prepared[]): ResultAsync<RupeeError[]> =>
	inOrder(
		prepared
			.toSorted((a, b) => Number(b.primary) - Number(a.primary))
			.map((p) => () => write(ledger, p)),
	)
		.map((): RupeeError[] => [])
		.orElse((e) => ok([e]));

const write = (l: Ledger, p: Prepared): ResultAsync<RupeeFile> =>
	p.content === p.file.content
		? okAsync(p.file)
		: editFile({ ledger: l, key: p.file.key, content: p.content, version: p.file.version });

const byEvent = (transactions: DB.IndexedTransaction[]): FileEvent[] => {
	const members = counted(transactions).transactions.flatMap((t) =>
		linksOf(t.metadata).map((l) => ({ event: l.event, member: { ...t, role: l.role } })),
	);

	return Object.entries(Object.groupBy(members, (m) => m.event)).map(([event, group = []]) => ({
		event,
		members: group.map((m) => m.member),
	}));
};
