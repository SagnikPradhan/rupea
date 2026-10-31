import type { LedgerConfiguration } from '#lib/server/shared/context/config.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import { err, ok, type Result } from '#lib/server/shared/result/result.ts';
import type { TransactionForm } from '#lib/shared/transaction-form.ts';
import { DEFAULT_COMMODITY, parseAmount, type Amount, type Quantity } from './amounts';
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

/** Writes a form's transaction into a file by date, only if the file then reads back as meant. */
export const insert = (
	c: LedgerConfiguration,
	{ file, form }: InsertOptions,
): Result<{ content: string; line: number }> => {
	const cannot = err(fault('CannotWriteTransaction', { path: file.key }));

	const node = nodeOf(file.key, form);
	const alone = print(c, { kind: NodeKind.File, comments: [], metadata: [], children: [node] });
	const [entry, ...rest] = parseTree(c, { key: file.key, content: alone }).children;
	if (entry?.kind === NodeKind.Failed && entry.errors[0]) return err(entry.errors[0]);
	if (entry?.kind !== NodeKind.Transaction || rest.length > 0) return cannot;
	if (shapeOf(entry) !== shapeOf(node)) return cannot;

	const tree = parseTree(c, file);
	const at = placeOf(tree.children, entry);
	const children = tree.children.toSpliced(at, 0, entry);

	return written(c, file.key, { ...tree, children }).map(({ content, read }) => ({
		content,
		line: (read.children[at] as RupeaTransactionNode).location.line,
	}));
};

/** Prints a changed tree, refusing it if the text would read back as anything else. */
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

/** A node without where it sits or why it failed, and without what an elided posting works out. */
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
	description: form.description.split(/\s+/).join(' '),
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

const commentsOf = (t: string) => (t.trim() === '' ? [] : t.trim().split(/\s*\n/));

/** The form's schema has checked every amount by now. */
const amountOf = (t: string) => parseAmount(t) as Amount;

const quantityOf = (text: string): Quantity => {
	const [amount = '', commodity = DEFAULT_COMMODITY] = text.split(/\s+/);
	return { amount: amountOf(amount), commodity: commodity.toUpperCase() };
};
