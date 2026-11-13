import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AssetsRings from '#lib/web/components/app-assets-rings/app-assets-rings.svelte';

const arc = {
	key: 'Assets:Bank',
	label: 'Bank',
	level: 1,
	part: 0,
	from: 0,
	to: 1,
	value: 1000,
	share: 1,
	own: true,
};

describe('the assets rings', () => {
	it('names the account the rings divide', () => {
		render(AssetsRings, {
			rings: { arcs: [arc], levels: 1, skipped: 0 },
			account: 'Assets:Bank',
		});

		expect(
			screen.getByRole('img', { name: 'How Assets:Bank divides across its accounts' }),
		).toBeTruthy();
	});

	it('names the assets when no account is picked', () => {
		render(AssetsRings, { rings: { arcs: [arc], levels: 1, skipped: 0 }, account: null });

		expect(
			screen.getByRole('img', { name: 'How Assets divides across its accounts' }),
		).toBeTruthy();
	});

	it('says one account is below zero in the singular', () => {
		render(AssetsRings, { rings: { arcs: [arc], levels: 1, skipped: 1 }, account: null });

		expect(screen.getByText('1 account is below zero, so not drawn')).toBeTruthy();
	});

	it('says several accounts are below zero in the plural', () => {
		render(AssetsRings, { rings: { arcs: [arc], levels: 1, skipped: 3 }, account: null });

		expect(screen.getByText('3 accounts are below zero, so not drawn')).toBeTruthy();
	});

	it('shows no note when nothing is below zero', () => {
		render(AssetsRings, { rings: { arcs: [arc], levels: 1, skipped: 0 }, account: null });

		expect(screen.queryByText(/below zero/)).toBeNull();
	});

	it('says there is nothing to divide without arcs', () => {
		render(AssetsRings, { rings: { arcs: [], levels: 0, skipped: 0 }, account: null });

		expect(screen.getByText('Nothing to divide.')).toBeTruthy();
	});
});
