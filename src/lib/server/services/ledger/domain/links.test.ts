import { defaultConfiguration } from '#lib/server/shared/config.ts';
import { describe, expect, it } from 'vitest';
import { EventRole } from './events';
import { insertLinks, rewriteLinks, type LinkEdit } from './links';

const content = [
	'- statement: oct.pdf',
	'',
	'2026-10-01 TEA',
	'\tAssets:Bank -1',
	'\tExpenses:Food',
	'',
	'2026-10-02 COFFEE',
	'; keeps comments',
	'\tAssets:Bank -2',
	'\tExpenses:Food',
	'',
].join('\n');

const edit = (line: number, description: string, date: string, role: EventRole): LinkEdit => ({
	file: 'a.rupee',
	line,
	date,
	description,
	role,
	event: `e${line}`,
});

const insert = (e: LinkEdit[], text = content) =>
	insertLinks(defaultConfiguration, { key: 'a.rupee', content: text }, e);

describe('inserting links', () => {
	it('puts each link under its header and leaves the rest alone', () => {
		expect(
			insert([
				edit(3, 'TEA', '2026-10-01', EventRole.Primary),
				edit(7, 'COFFEE', '2026-10-02', EventRole.Evidence),
			])._unsafeUnwrap(),
		).toBe(
			[
				'- statement: oct.pdf',
				'',
				'2026-10-01 TEA',
				'\t- event: e3',
				'\tAssets:Bank -1',
				'\tExpenses:Food',
				'',
				'2026-10-02 COFFEE',
				'\t- same-as: e7',
				'; keeps comments',
				'\tAssets:Bank -2',
				'\tExpenses:Food',
				'',
			].join('\n'),
		);
	});

	it.each([
		['no header there', edit(4, 'TEA', '2026-10-01', EventRole.Primary)],
		['another description', edit(3, 'TEA CUP', '2026-10-01', EventRole.Primary)],
		['another date', edit(3, 'TEA', '2026-10-02', EventRole.Primary)],
	])('refuses a target with %s', (_, e) => {
		expect(insert([e])._unsafeUnwrapErr()).toEqual({
			type: 'EventStale',
			location: `a.rupee:${e.line}`,
			cause: [],
		});
	});

	it('refuses a transaction already linked, or linked twice at once', () => {
		const linked = content.replace('2026-10-01 TEA\n', '2026-10-01 TEA\n\t- event: old\n');
		const tea = edit(3, 'TEA', '2026-10-01', EventRole.Primary);

		expect(insert([tea], linked).isErr()).toBe(true);
		expect(insert([tea, tea]).isErr()).toBe(true);
	});
});

describe('rewriting links', () => {
	const linked = [
		'2026-10-01 TEA',
		'; the bank side',
		'    - note: chai',
		'    - same-as: tea-otter',
		'\tAssets:Bank -1',
		'\t\t- event: tea-otter',
		'\tExpenses:Food',
		'',
		'2026-10-01 TEA',
		'\t- event: other',
		'\tAssets:Bank -1',
		'\tExpenses:Food',
		'',
	].join('\n');

	const rewrite = (text: string) =>
		rewriteLinks(defaultConfiguration, { key: 'a.rupee', content: text }, 'tea-otter', () => ({
			event: 'tea-cat',
			role: EventRole.Primary,
		}));

	it('changes only the link to the event, keeping its indentation', () => {
		expect(rewrite(linked)._unsafeUnwrap()).toBe(
			linked.replace('    - same-as: tea-otter', '    - event: tea-cat'),
		);
	});

	it('refuses a file with no member of the event', () => {
		expect(rewrite(content)._unsafeUnwrapErr()).toEqual({
			type: 'EventStale',
			location: 'a.rupee',
			cause: [],
		});
	});
});
