import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Drops from '#lib/web/components/app-drops/app-drops.svelte';

const DROPS = {
	underwater: [
		{ day: '2026-01-01', depth: 0 },
		{ day: '2026-02-01', depth: -0.2 },
		{ day: '2026-03-01', depth: -0.1 },
	],
	lows: [
		{ account: 'Assets:Gold', depth: -0.2, day: '2026-02-01' },
		{ account: 'Assets:Equity', depth: -0.1, day: '2026-02-01' },
		{ account: 'Assets:Bonds', depth: 0, day: '2026-01-01' },
	],
};

describe('the drops chart', () => {
	it('draws nothing before there is a day', () => {
		render(Drops, { drops: { underwater: [], lows: [] } });
		expect(screen.queryByRole('figure')).toBeNull();
	});

	it('names the lowest point beside how far below its high the last day stood', () => {
		render(Drops, { drops: DROPS });

		expect(screen.getByText('-10%', { selector: 'p' })).toBeTruthy();
		expect(screen.getByText(/^Lowest -20%/)).toBeTruthy();
		expect(screen.getByRole('img', { name: /lowest -20%/ })).toBeTruthy();
	});

	it('lists each account that fell with its low, and none that did not', () => {
		render(Drops, { drops: DROPS });

		const names = screen
			.getAllByRole('link')
			.map((l) => l.textContent?.replace(/\s+/g, ' ').trim());
		expect(names).toEqual(['Gold low Feb 2026 -20%', 'Equity low Feb 2026 -10%']);
	});

	it('links each account to its filter, and the chosen one to none', () => {
		render(Drops, { drops: DROPS, account: 'Assets:Gold' });

		const gold = screen.getByText('Gold').closest('a')!;
		expect(gold.classList.contains('on')).toBe(true);
		expect(gold.getAttribute('href')).not.toContain('account');
		expect(screen.getByRole('link', { name: /^Equity/ }).getAttribute('href')).toContain(
			'account=Assets%3AEquity',
		);
	});
});
