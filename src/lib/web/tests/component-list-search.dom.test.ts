import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ListSearch from '#lib/web/components/list-search/list-search.svelte';

vi.mock('$app/state', () => ({
	page: {
		url: new URL('https://rupea.test/l/h/postings?at=2026&account=Assets&page=&description=tea'),
	},
}));

describe('the list search', () => {
	it('keeps every other parameter of the query, and drops the empty ones', () => {
		const filter = {
			period: { kind: 'year', at: '2026' } as const,
			account: 'Assets',
			description: 'tea',
		};
		const { container } = render(ListSearch, { filter });

		const hidden = [...container.querySelectorAll<HTMLInputElement>('input[type="hidden"]')];
		expect(hidden.map((i) => [i.name, i.value])).toEqual([
			['at', '2026'],
			['account', 'Assets'],
		]);
	});
});
