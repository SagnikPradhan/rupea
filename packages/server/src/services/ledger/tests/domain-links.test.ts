import { defaultConfiguration } from '#lib/server/shared/context/config.ts';
import { describe, expect, it } from 'vitest';
import { GroupRole } from '#services/ledger/domain/groups.ts';
import { insertLinks, rewriteLinks, type LinkEdit } from '#services/ledger/domain/links.ts';

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

const edit = (line: number, description: string, date: string, role: GroupRole): LinkEdit => ({
	file: 'a.rupea',
	line,
	date,
	description,
	role,
	group: `e${line}`,
});

const insert = (e: LinkEdit[], text = content) =>
	insertLinks(defaultConfiguration.ledger, { key: 'a.rupea', content: text }, e);

describe('inserting links', () => {
	it('puts each link under its header and leaves the rest alone', () => {
		expect(
			insert([
				edit(3, 'TEA', '2026-10-01', GroupRole.Primary),
				edit(7, 'COFFEE', '2026-10-02', GroupRole.Evidence),
			])._unsafeUnwrap(),
		).toBe(
			[
				'- statement: oct.pdf',
				'',
				'2026-10-01 TEA',
				'\t- group: e3',
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
		['no header there', edit(4, 'TEA', '2026-10-01', GroupRole.Primary)],
		['another description', edit(3, 'TEA CUP', '2026-10-01', GroupRole.Primary)],
		['another date', edit(3, 'TEA', '2026-10-02', GroupRole.Primary)],
	])('refuses a target with %s', (_, e) => {
		expect(insert([e])._unsafeUnwrapErr()).toEqual({
			type: 'GroupStale',
			location: `a.rupea:${e.line}`,
		});
	});

	it('refuses a transaction already linked, or linked twice at once', () => {
		const linked = content.replace('2026-10-01 TEA\n', '2026-10-01 TEA\n\t- group: old\n');
		const tea = edit(3, 'TEA', '2026-10-01', GroupRole.Primary);

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
		'\t\t- group: tea-otter',
		'\tExpenses:Food',
		'',
		'2026-10-01 TEA',
		'\t- group: other',
		'\tAssets:Bank -1',
		'\tExpenses:Food',
		'',
	].join('\n');

	const rewrite = (text: string) =>
		rewriteLinks(
			defaultConfiguration.ledger,
			{ key: 'a.rupea', content: text },
			'tea-otter',
			() => ({
				group: 'tea-cat',
				role: GroupRole.Primary,
			}),
		);

	it('changes only the link to the group, keeping its indentation', () => {
		expect(rewrite(linked)._unsafeUnwrap()).toBe(
			linked.replace('    - same-as: tea-otter', '    - group: tea-cat'),
		);
	});

	it('refuses a file with no member of the group', () => {
		expect(rewrite(content)._unsafeUnwrapErr()).toEqual({
			type: 'GroupStale',
			location: 'a.rupea',
		});
	});
});
