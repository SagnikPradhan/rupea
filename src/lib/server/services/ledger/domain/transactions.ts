import type { LedgerConfiguration } from '#lib/server/shared/context/config.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { err, ok, type Result } from '#lib/server/shared/result/result.ts';
import type { TransactionForm } from '#lib/shared/transaction-form.ts';
import {
	DEFAULT_COMMODITY,
	formatAmount,
	formatQuantity,
	parseAmount,
	type Amount,
	type Quantity,
} from './amounts';
import { parseTree } from './parser';
import { print } from './printer';
import {
	NodeKind,
	PriceKind,
	type RupeaEntryNode,
	type RupeaFile,
	type RupeaFileNode,
	type RupeaPostingNode,
	type RupeaTransactionNode,
} from './types';

type InsertOptions = { file: Pick<RupeaFile, 'key' | 'content'>; form: TransactionForm };

/**
 * Writes a form's transaction into a file by date, only if the file then reads
 * back as meant.
 */
export const insert = (
	c: LedgerConfiguration,
	{ file, form }: InsertOptions,
): Result<{ content: string; line: number }> => {
	const tree = parseTree(c, file);

	return entryOf(c, file.key, form).andThen((e) => placed(c, file.key, tree, tree.children, e));
};

type ReplaceOptions = {
	file: Pick<RupeaFile, 'key' | 'content'>;
	line: number;
	form: TransactionForm;
};

/** Swaps the transaction at a line for a form's, which moves if its date did. */
export const replace = (
	c: LedgerConfiguration,
	{ file, line, form }: ReplaceOptions,
): Result<{ content: string; line: number }> => {
	const tree = parseTree(c, file);

	return found(tree, file.key, line).andThen(({ others, old }) =>
		entryOf(c, file.key, form).andThen((e) =>
			placed(c, file.key, tree, others, e, old.date.equals(e.date) ? old : null),
		),
	);
};

/** Takes the transaction at a line out of a file. */
export const remove = (
	c: LedgerConfiguration,
	{ file, line }: Pick<ReplaceOptions, 'file' | 'line'>,
): Result<{ content: string }> => {
	const tree = parseTree(c, file);

	return found(tree, file.key, line)
		.andThen(({ others }) => written(c, file.key, { ...tree, children: others }))
		.map(({ content }) => ({ content }));
};

/** The form that would write a transaction as it is. */
export const formOf = (file: string, t: RupeaTransactionNode): TransactionForm => ({
	file,
	date: t.date.toString(),
	time: t.time?.toString() ?? '',
	description: t.description,
	comment: t.comments.join('\n'),
	metadata: t.metadata.map(([key, value]) => ({ key, value })),
	postings: t.children.map((p) => ({
		account: p.account,
		amount: p.elided ? '' : formatAmount(p.amount),
		commodity: p.elided || p.commodity === DEFAULT_COMMODITY ? '' : p.commodity,
		price: p.price === null ? '' : formatQuantity(p.price),
		total: p.price?.kind === PriceKind.Total,
		cost: p.cost === null ? '' : formatQuantity(p.cost),
		costDate: p.cost?.date?.toString() ?? '',
		balance: p.balance === null ? '' : formatAmount(p.balance),
		comment: p.comments.join('\n'),
		metadata: p.metadata.map(([key, value]) => ({ key, value })),
	})),
});

/** The transaction that starts at a line, and the entries around it. */
export const find = (
	c: LedgerConfiguration,
	{ file, line }: Pick<ReplaceOptions, 'file' | 'line'>,
): Result<TransactionForm> =>
	found(parseTree(c, file), file.key, line).map(({ old }) => formOf(file.key, old));

const found = (
	tree: RupeaFileNode,
	key: string,
	line: number,
): Result<{ old: RupeaTransactionNode; others: RupeaEntryNode[] }> => {
	const old = tree.children.find(
		(e): e is RupeaTransactionNode => e.kind === NodeKind.Transaction && e.location.line === line,
	);
	return old
		? ok({ old, others: tree.children.filter((e) => e !== old) })
		: err(fault('TransactionNotFound', { path: key, line }));
};

/** A form's transaction as the entry a file would read it back as. */
const entryOf = (
	c: LedgerConfiguration,
	key: string,
	form: TransactionForm,
): Result<RupeaTransactionNode> => {
	const cannot = err(fault('CannotWriteTransaction', { path: key }));

	const node = nodeOf(key, form);
	const alone = print(c, { kind: NodeKind.File, comments: [], metadata: [], children: [node] });
	const [entry, ...rest] = parseTree(c, { key, content: alone }).children;
	if (entry?.kind === NodeKind.Failed && entry.errors[0]) return err(entry.errors[0]);
	if (entry?.kind !== NodeKind.Transaction || rest.length > 0) return cannot;
	if (shapeOf(entry) !== shapeOf(node)) return cannot;

	return ok(entry);
};

/**
 * Puts an entry among the others by its date, or back where an old one stood,
 * and prints the file.
 */
const placed = (
	c: LedgerConfiguration,
	key: string,
	tree: RupeaFileNode,
	others: RupeaEntryNode[],
	entry: RupeaTransactionNode,
	stood: RupeaTransactionNode | null = null,
): Result<{ content: string; line: number }> => {
	const before = stood ? tree.children.indexOf(stood) : placeOf(others, entry);
	const children = others.toSpliced(before, 0, entry);

	return written(c, key, { ...tree, children }).map(({ content, read }) => ({
		content,
		line: (read.children[before] as RupeaTransactionNode).location.line,
	}));
};

/**
 * Prints a changed tree, refusing it if the text would read back as anything
 * else.
 */
const written = (
	c: LedgerConfiguration,
	key: string,
	tree: RupeaFileNode,
): Result<{ content: string; read: RupeaFileNode }> => {
	const content = print(c, tree);
	const read = parseTree(c, { key, content });

	return shapeOf(read) === shapeOf(tree)
		? ok({ content, read })
		: err(fault('CannotWriteTransaction', { path: key }));
};

/** Above the first transaction dated after it, or at the end. */
const placeOf = (entries: RupeaEntryNode[], t: RupeaTransactionNode) => {
	const later = entries.findIndex(
		(e) => e.kind === NodeKind.Transaction && Temporal.PlainDate.compare(e.date, t.date) > 0,
	);
	return later < 0 ? entries.length : later;
};

/**
 * A node without where it sits or why it failed, and without what an elided
 * posting works out.
 */
const shapeOf = (node: RupeaFileNode | RupeaEntryNode) =>
	JSON.stringify(node, (key, value: unknown) => {
		if (key === 'location' || key === 'errors') return undefined;
		if (typeof value === 'bigint') return value.toString();
		if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;

		const kept = isElided(value) ? { ...value, amount: undefined, commodity: undefined } : value;
		return Object.fromEntries(Object.entries(kept).toSorted(([a], [b]) => a.localeCompare(b)));
	});

const isElided = (x: unknown): x is RupeaPostingNode =>
	typeof x === 'object' && x !== null && 'elided' in x && x.elided === true;

const nodeOf = (file: string, form: TransactionForm): RupeaTransactionNode => ({
	kind: NodeKind.Transaction,
	location: { file, line: 1 },
	comments: commentsOf(form.comment),
	date: Temporal.PlainDate.from(form.date),
	time: form.time === '' ? null : Temporal.PlainTime.from(form.time),
	description: form.description.replaceAll(/\s+/g, ' '),
	metadata: form.metadata.map((m) => [m.key, m.value]),
	children: form.postings.map(postingOf),
});

const postingOf = (p: TransactionForm['postings'][number]): RupeaPostingNode => ({
	kind: NodeKind.Posting,
	comments: commentsOf(p.comment),
	account: p.account,
	amount: p.amount === '' ? (0n as Amount) : amountOf(p.amount),
	elided: p.amount === '',
	commodity: p.commodity === '' ? DEFAULT_COMMODITY : p.commodity.toUpperCase(),
	price:
		p.price === ''
			? null
			: { ...quantityOf(p.price), kind: p.total ? PriceKind.Total : PriceKind.Unit },
	cost:
		p.cost === ''
			? null
			: {
					...quantityOf(p.cost),
					date: p.costDate === '' ? null : Temporal.PlainDate.from(p.costDate),
				},
	balance: p.balance === '' ? null : amountOf(p.balance),
	metadata: p.metadata.map((m) => [m.key, m.value]),
	children: [],
});

const commentsOf = (t: string) =>
	t
		.trim()
		.split('\n')
		.map((l) => l.trimEnd())
		.filter((l) => l !== '');

/** The form's schema has checked every amount by now. */
const amountOf = (t: string) => parseAmount(t) as Amount;

const quantityOf = (text: string): Quantity => {
	const [amount = '', commodity = DEFAULT_COMMODITY] = text.split(/\s+/);
	return { amount: amountOf(amount), commodity: commodity.toUpperCase() };
};
