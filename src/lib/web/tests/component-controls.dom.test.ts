import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/state', () => ({ page: { url: new URL('https://rupee.test/?ledger=a&span=5') } }));
import ChoiceChips from '#lib/web/components/choice-chips/choice-chips.svelte';
import FilterModal from '#lib/web/components/filter-modal/filter-modal.svelte';
import Chip from '#lib/web/components/chip/chip.svelte';
import SegmentedControl from '#lib/web/components/segmented-control/segmented-control.svelte';

const label = createRawSnippet(() => ({ render: () => '<span>Last 2 years</span>' }));

describe('a chip', () => {
	it('is an outlined link with an empty box when it is off', () => {
		render(Chip, { href: '?span=5', children: label });

		const link = screen.getByRole('link', { name: 'Last 2 years' });
		expect(link.getAttribute('href')).toBe('?span=5');
		expect(link.className).not.toContain('on');
		expect(link.querySelector('svg')).toBeNull();
	});

	it('has a checked box when it is on', () => {
		render(Chip, { href: '?', on: true, children: label });

		const link = screen.getByRole('link', { name: 'Last 2 years' });
		expect(link.className).toContain('on');
		expect(link.querySelector('svg')).toBeTruthy();
	});
});

describe('a filter modal', () => {
	it('opens from a Filter button and has Close and Apply to hide it', () => {
		render(FilterModal, { params: ['span'], children: label });

		expect(screen.getByRole('button', { name: 'Filter' }).getAttribute('popovertarget')).toBe(
			'filter',
		);
		expect(screen.getByRole('button', { name: 'Apply' }).getAttribute('popovertargetaction')).toBe(
			'hide',
		);
		expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
	});

	it('resets by clearing its own parameters, keeping the rest of the query', () => {
		render(FilterModal, { params: ['span'], children: label });

		expect(screen.getByRole('link', { name: 'Reset' }).getAttribute('href')).toBe('?ledger=a');
	});
});

describe('choice chips', () => {
	const choices = { '': 'All accounts', Assets: 'Assets' };

	it('checks the current choice and links to each choice', () => {
		render(ChoiceChips, { param: 'account', label: 'Accounts', choices, current: 'Assets' });

		const nav = screen.getByRole('navigation', { name: 'Accounts' });
		expect(nav.querySelectorAll('svg')).toHaveLength(1);
		expect(screen.getByRole('link', { name: 'All accounts' }).getAttribute('href')).toBe(
			'?ledger=a&span=5',
		);
	});
});

describe('a segmented control', () => {
	it('names its views and marks the chosen one', () => {
		render(SegmentedControl, {
			label: 'Period',
			segments: [
				{ name: 'Month', href: '?a=1', chosen: false },
				{ name: 'Year', href: '?a=2', chosen: true },
			],
		});

		expect(screen.getByRole('navigation', { name: 'Period' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Year' }).getAttribute('aria-current')).toBe('page');
		expect(screen.getByRole('link', { name: 'Month' }).getAttribute('aria-current')).toBeNull();
	});
});
