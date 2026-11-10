import { defaultConfiguration } from '#lib/server/shared/context/config.ts';
import { parseAmount } from '#services/ledger/domain/amounts.ts';
import { parse, parseTree } from '#services/ledger/domain/parser.ts';
import { print } from '#services/ledger/domain/printer.ts';
import { NodeKind, type RupeaNode } from '#services/ledger/domain/types.ts';
import { describe, expect, it } from 'vitest';

const c = defaultConfiguration.ledger;
const tree = (n: string[]) => parseTree(c, { key: 'a.rupea', content: `${n.join('\n')}\n` });
const format = (content: string) => print(c, parseTree(c, { key: 'a.rupea', content }));

/** The tree without where each node was read, which printing moves. */
const unplaced = (node: RupeaNode): unknown =>
	JSON.parse(
		JSON.stringify(node, (key, value) =>
			key === 'location' ? undefined : typeof value === 'bigint' ? `${value}` : value,
		),
	);

const messy = [
	'',
	'; my ledger',
	'- statement: a.csv   ',
	'',
	';; March',
	'',
	'; weekly shop',
	'2026-08-29 Groceries',
	'  - receipt: r1',
	'; among metadata',
	'  - receipt: r2',
	'    Expenses:Food     100.50   @  2 USD',
	'      - note: weekly',
	';card',
	'  Assets:Bank',
	'',
	'',
	'P 2026-08-29 USD 83.10',
	'2026-08-30 Salary',
	'\tAssets:Bank 50000',
	'\tIncome:Salary',
	'',
	'2026-08-31 Typo',
	'\tExpenses:Food 10',
	'\tAssets:Bank -9',
	'',
	'; the end',
	'',
].join('\n');

describe('reading a file into nodes', () => {
	it('hangs a comment on the node right above it', () => {
		const [transaction] = tree([
			'2026-08-29 Groceries',
			'\t; on the header',
			'\tExpenses:Food 100',
			'; on the food',
			'\tAssets:Bank',
			'\t\t; on the bank',
		]).children;

		expect(transaction).toMatchObject({
			kind: NodeKind.Transaction,
			comments: ['on the header'],
			children: [{ comments: ['on the food'] }, { comments: ['on the bank'] }],
		});
	});

	it('gives a comment among metadata to the node the metadata belongs to', () => {
		const [transaction] = tree([
			'2026-08-29 Groceries',
			'\t- receipt: r1',
			'; among',
			'\t- receipt: r2',
			'\tExpenses:Food 100',
			'\t\t- tag: a',
			'; under the tag',
			'\t\t- tag: b',
			'\tAssets:Bank',
		]).children;

		expect(transaction).toMatchObject({
			comments: ['among'],
			metadata: [
				['receipt', 'r1'],
				['receipt', 'r2'],
			],
			children: [{ comments: ['under the tag'] }, { comments: [] }],
		});
	});

	it('keeps comments after a blank line as notes', () => {
		const file = tree([
			'2026-08-29 Groceries',
			'\tExpenses:Food 100',
			'\tAssets:Bank',
			'',
			'; section',
			'2026-08-30 Rent',
			'\tExpenses:Rent 100',
			'\tAssets:Bank',
			'',
			'; the end',
		]);

		expect(file.children.map((e) => [e.kind, e.comments])).toEqual([
			[NodeKind.Transaction, []],
			[NodeKind.Note, ['section']],
			[NodeKind.Transaction, []],
			[NodeKind.Note, ['the end']],
		]);
	});

	it('gives the file the comments in its opening block, and leaves those after a blank line', () => {
		const file = tree([
			'; mine',
			'- statement: a.csv',
			'; after',
			'',
			'; apart',
			'2026-08-29 Rent',
			'\tExpenses:Rent 1',
			'\tAssets:Bank',
		]);

		expect(file).toMatchObject({ comments: ['mine', 'after'], metadata: [['statement', 'a.csv']] });
		expect(file.children).toMatchObject([
			{ kind: NodeKind.Note, comments: ['apart'] },
			{ kind: NodeKind.Transaction, comments: [] },
		]);
	});

	it('gives the file the comments at its top when it has no metadata', () => {
		expect(tree(['; title', '2026-08-29 Rent', '\tA:B 1', '\tA:C']).comments).toEqual(['title']);
	});

	it('keeps metadata in the order it was written', () => {
		expect(tree(['- a: 1', '- b: 2', '- a: 3']).metadata).toEqual([
			['a', '1'],
			['b', '2'],
			['a', '3'],
		]);
	});

	it('marks the posting written without an amount', () => {
		const [transaction] = tree([
			'2026-08-29 Rent',
			'\tExpenses:Rent 100',
			'\tAssets:Bank',
		]).children;

		expect(transaction).toMatchObject({
			children: [
				{ elided: false, amount: parseAmount('100') },
				{ elided: true, amount: parseAmount('-100') },
			],
		});
	});

	it('keeps a transaction that does not read as written, and reads on after it', () => {
		const file = tree([
			'2026-08-29 Typo',
			'; inside',
			'\tExpenses:Food 10',
			'\tAssets:Bank -9',
			'',
			'2026-08-30 Rent',
			'\tExpenses:Rent 100',
			'\tAssets:Bank',
		]);

		expect(file.children).toMatchObject([
			{
				kind: NodeKind.Failed,
				lines: ['2026-08-29 Typo', '; inside', '\tExpenses:Food 10', '\tAssets:Bank -9'],
				errors: [{ type: 'ParseUnbalancedTransaction' }],
			},
			{ kind: NodeKind.Transaction, description: 'Rent' },
		]);
	});

	it('after a bad header, reads only P lines and keeps the rest as written', () => {
		const file = tree([
			'not a header',
			'\tExpenses:Food 10',
			'',
			'P 2026-08-29 USD 83.10',
			'',
			'2026-08-30 Rent',
			'\tExpenses:Rent 100',
			'\tAssets:Bank',
		]);

		expect(file.children).toMatchObject([
			{
				kind: NodeKind.Failed,
				lines: ['not a header', '\tExpenses:Food 10'],
				errors: [{ type: 'ParseInvalidTransactionHeader' }],
			},
			{ kind: NodeKind.Price, commodity: 'USD' },
			{
				kind: NodeKind.Failed,
				lines: ['2026-08-30 Rent', '\tExpenses:Rent 100', '\tAssets:Bank'],
				errors: [],
			},
		]);
	});

	it('reports every failure in the order written', () => {
		expect(parse(c, { key: 'a.rupea', content: messy }).failed).toMatchObject([
			{ type: 'ParseUnbalancedTransaction' },
		]);
	});
});

describe('printing nodes back', () => {
	it('writes a messy file tidily, keeping every comment and line with what holds it', () => {
		expect(format(messy)).toBe(
			[
				'- statement: a.csv',
				'; my ledger',
				'',
				';; March',
				'',
				'; weekly shop',
				'',
				'2026-08-29 Groceries',
				'\t; among metadata',
				'\t- receipt: r1',
				'\t- receipt: r2',
				'\tExpenses:Food  100.50 @ 2.00 USD',
				'\t\t; card',
				'\t\t- note: weekly',
				'\tAssets:Bank',
				'',
				'P 2026-08-29 USD 83.10',
				'',
				'2026-08-30 Salary',
				'\tAssets:Bank    50000.00',
				'\tIncome:Salary',
				'',
				'2026-08-31 Typo',
				'\tExpenses:Food 10',
				'\tAssets:Bank -9',
				'',
				'; the end',
				'',
			].join('\n'),
		);
	});

	it('leaves what it printed as it is', () => {
		expect(format(format(messy))).toBe(format(messy));
	});

	it('reads what it printed back into the same nodes', () => {
		const once = parseTree(c, { key: 'a.rupea', content: messy });
		const twice = parseTree(c, { key: 'a.rupea', content: print(c, once) });

		expect(unplaced(twice)).toEqual(unplaced(once));
	});

	it('keeps a comment that starts with a semicolon close to it', () => {
		expect(format(';; heading\n;\n')).toBe(';; heading\n;\n');
	});

	it('leaves an empty file empty', () => {
		expect(format('\n\n')).toBe('');
	});
});
