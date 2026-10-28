import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { ledger } from '#lib/web/components/code-editor/ledger.ts';

const tokens = (text: string) => {
	const state = EditorState.create({ doc: text, extensions: ledger });
	const found: string[][] = [];
	ensureSyntaxTree(state, state.doc.length)?.iterate({
		enter: (n) => {
			if (!n.type.isTop) found.push([n.name, state.sliceDoc(n.from, n.to)]);
		},
	});
	return found;
};

describe('ledger highlighting', () => {
	it('marks the date and time of a header, and leaves its description', () => {
		expect(tokens('2026-08-29 09:30 Groceries')).toEqual([
			['keyword', '2026-08-29'],
			['keyword', '09:30'],
		]);
	});

	it('marks a posting’s account, and its amount by sign', () => {
		expect(tokens('\tExpenses:Food 100\n\tAssets:Bank -100')).toEqual([
			['variableName', 'Expenses:Food'],
			['number', '100'],
			['variableName', 'Assets:Bank'],
			['negative', '-100'],
		]);
	});

	it('marks prices, commodities, metadata keys and comments', () => {
		expect(tokens('\tAssets:Fund 2 FUND @ 10\n\t- group: salary\n; a note')).toEqual([
			['variableName', 'Assets:Fund'],
			['number', '2'],
			['atom', 'FUND'],
			['operator', '@'],
			['number', '10'],
			['meta', '- group:'],
			['string', 'salary'],
			['comment', '; a note'],
		]);
	});

	it('marks the words of a line it does not know', () => {
		expect(tokens('include 2026-08-29')).toEqual([
			['atom', 'include'],
			['keyword', '2026-08-29'],
		]);
	});
});
