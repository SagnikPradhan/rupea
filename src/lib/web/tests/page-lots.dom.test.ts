import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { listLots } from '#lib/endpoints/accounts.remote.ts';
import { data, visit } from '#tests/shared/app-state.ts';
import { answer } from '#tests/shared/queries.ts';
import Page from '#routes/(signed-in)/l/[handle]/accounts/lots/+page.svelte';

vi.mock('$app/state', () => import('#tests/shared/app-state.ts'));
vi.mock('#lib/endpoints/accounts.remote.ts', () => ({ listLots: vi.fn() }));

describe('the lots page', () => {
	const lot = {
		file: 'broker.rupee',
		line: 3,
		date: '2026-01-05',
		origin: 'bought',
		from: null,
		units: '2',
		remaining: '1',
		cost: '1500 INR',
		disposals: [
			{
				file: 'broker.rupee',
				line: 9,
				date: '2026-06-01',
				kind: 'sold',
				units: '-1',
				price: '2000 INR',
				gain: '500 INR',
			},
		],
	};

	it('lists each lot with what was left and how it was sold', async () => {
		visit('/l/h/accounts/lots?account=Assets:Broker&commodity=INFY');
		vi.mocked(listLots).mockReturnValue(answer([lot]));
		render(Page, { data });

		expect(await screen.findByText('INFY in Assets:Broker')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'sold' }).getAttribute('href')).toBe(
			'/l/h/files?file=broker.rupee&line=9',
		);
		expect(screen.getByText(/left/).textContent).toContain('1');
	});

	it('says when the account holds no lots of it', async () => {
		visit('/l/h/accounts/lots?account=Assets:Bank&commodity=INFY');
		vi.mocked(listLots).mockReturnValue(answer([]));
		render(Page, { data });

		expect(await screen.findByText('No lots of INFY in Assets:Bank.')).toBeTruthy();
	});
});
