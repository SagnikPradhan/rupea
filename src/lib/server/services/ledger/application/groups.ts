import type { LedgerConfiguration } from '#lib/server/shared/context/config.ts';
import { withContext } from '#lib/server/shared/context/context.ts';
import { batchInOrder } from '#lib/server/shared/result/batch.ts';
import { fault, type RupeaError } from '#lib/server/shared/result/error.ts';
import {
	errAsync,
	inOrder,
	ok,
	okAsync,
	type Result,
	type ResultAsync,
} from '#lib/server/shared/result/result.ts';
import * as DB from '../adapters/database';
import { counted, GroupRole, linksOf } from '../domain/groups';
import { insertLinks, rewriteLinks, type LinkEdit, type Relink } from '../domain/links';
import type { Ledger, RupeaFile, RupeaTransaction } from '../domain/types';
import { editFile, readFile } from './files';

type Candidates = { pairs: DB.CandidatePair[]; transactions: DB.IndexedTransaction[] };

type GroupMember = DB.IndexedTransaction & { role: GroupRole; counted: boolean };

export type FileGroup = { group: string; members: GroupMember[] };

type InFileOptions = { ledger: Ledger; file: string };

// Pairs a file's transactions could form groups with, and both sides of each.
export const listCandidates = ({ ledger, file }: InFileOptions): ResultAsync<Candidates> =>
	DB.listCandidates(ledger.id, file).andThen((pairs) => {
		const ids = [...new Set(pairs.flatMap((p) => [p.ours, p.theirs]))];
		return DB.findTransactions(ledger.id, ids).map((t) => ({ pairs, transactions: t }));
	});

type IsGroupIdTakenOptions = { ledger: Ledger; id: string };

export const isGroupIdTaken = ({ ledger, id }: IsGroupIdTakenOptions): ResultAsync<boolean> =>
	DB.isGroupIdTaken(ledger.id, id);

// Groups with a member in the file, with every member wherever it is written.
export const listGroups = ({ ledger, file }: InFileOptions): ResultAsync<FileGroup[]> =>
	DB.listGroupsInFile(ledger.id, file).map(byGroup);

type LinkGroupsOptions = { ledger: Ledger; edits: LinkEdit[] };

export const linkGroups = ({ ledger, edits }: LinkGroupsOptions): ResultAsync<RupeaError[]> =>
	rewriteFiles(
		ledger,
		Object.entries(Object.groupBy(edits, (e) => e.file)).map(([key, inFile = []]) => ({
			key,
			primary: inFile.some((e) => e.role === GroupRole.Primary),
			write: (c, f) => insertLinks(c, f, inFile),
		})),
	);

type RenameGroupOptions = { ledger: Ledger; group: string; to: string };

export const renameGroup = ({ ledger, group, to }: RenameGroupOptions): ResultAsync<RupeaError[]> =>
	DB.isGroupIdTaken(ledger.id, to)
		.andThen((t) =>
			t ? errAsync(fault('GroupIdTaken', { group: to })) : DB.listGroupMembers(ledger.id, group),
		)
		.andThen((m) =>
			relinkFiles(ledger, { group, members: m, relink: (_, l) => ({ ...l, group: to }) }),
		);

type MakePrimaryOptions = { ledger: Ledger; group: string; file: string; line: number };

// The member becomes the one that counts; the old primary becomes evidence.
export const makePrimary = ({
	ledger,
	group,
	file,
	line,
}: MakePrimaryOptions): ResultAsync<RupeaError[]> => {
	const isTarget = (t: RupeaTransaction) => t.location.file === file && t.location.line === line;
	const isPrimary = (t: DB.IndexedTransaction) =>
		linksOf(t.metadata).some((l) => l.group === group && l.role === GroupRole.Primary);
	const relink: Relink = (t, l) => ({
		...l,
		role: isTarget(t) ? GroupRole.Primary : GroupRole.Evidence,
	});

	return DB.listGroupMembers(ledger.id, group)
		.andThen((m) =>
			m.some(isTarget)
				? okAsync(m)
				: errAsync(fault('GroupStale', { location: `${file}:${line}` })),
		)
		.andThen((m) =>
			relinkFiles(ledger, { group, members: m.filter((t) => isTarget(t) || isPrimary(t)), relink }),
		);
};

type RelinkOptions = { group: string; members: DB.IndexedTransaction[]; relink: Relink };

const relinkFiles = (ledger: Ledger, o: RelinkOptions): ResultAsync<RupeaError[]> => {
	const relinked = o.members.flatMap((t) =>
		linksOf(t.metadata)
			.filter((l) => l.group === o.group)
			.map((l) => ({ file: t.location.file, link: o.relink(t, l) })),
	);

	return rewriteFiles(
		ledger,
		Object.entries(Object.groupBy(relinked, (r) => r.file)).map(([key, inFile = []]) => ({
			key,
			primary: inFile.some((r) => r.link.role === GroupRole.Primary),
			write: (c, f) => rewriteLinks(c, f, o.group, o.relink),
		})),
	);
};

type Rewrite = {
	key: string;
	primary: boolean;
	write: (c: LedgerConfiguration, f: RupeaFile) => Result<string>;
};

type Prepared = { file: RupeaFile; content: string; primary: boolean };

// Every file is prepared before any is written, and files gaining a primary
// go first, each only if unchanged since it was read. Writing stops at the
// first failure: a link then leaves at worst a primary without its evidence,
// while a rename or a new primary can leave a broken group for sync to report.
const rewriteFiles = (l: Ledger, rs: Rewrite[]): ResultAsync<RupeaError[]> =>
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

const writeAll = (ledger: Ledger, prepared: Prepared[]): ResultAsync<RupeaError[]> =>
	inOrder(
		prepared
			.toSorted((a, b) => Number(b.primary) - Number(a.primary))
			.map((p) => () => write(ledger, p)),
	)
		.map((): RupeaError[] => [])
		.orElse((e) => ok([e]));

const write = (l: Ledger, p: Prepared): ResultAsync<RupeaFile> =>
	p.content === p.file.content
		? okAsync(p.file)
		: editFile({ ledger: l, key: p.file.key, content: p.content, version: p.file.version });

const byGroup = (transactions: DB.IndexedTransaction[]): FileGroup[] => {
	const members = counted(transactions).transactions.flatMap((t) =>
		linksOf(t.metadata).map((l) => ({ group: l.group, member: { ...t, role: l.role } })),
	);

	return Object.entries(Object.groupBy(members, (m) => m.group)).map(([group, linked = []]) => ({
		group,
		members: linked.map((m) => m.member),
	}));
};
