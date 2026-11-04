import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/state', () => ({ page: { url: new URL('https://rupee.test/?ledger=a&span=5') } }));
import Button from '#lib/web/components/ui-button/ui-button.svelte';
import ChoiceChips from '#lib/web/components/ui-chip-choices/ui-chip-choices.svelte';
import FilterModal from '#lib/web/components/ui-filter-modal/ui-filter-modal.svelte';
import Chip from '#lib/web/components/ui-chip/ui-chip.svelte';
import SegmentedControl from '#lib/web/components/ui-segmented-control/ui-segmented-control.svelte';

const label = createRawSnippet(() => ({ render: () => '<span>Last 2 years</span>' }));

describe('a button', () => {
	it('is a button without an href', () => {
		render(Button, { primary: true, children: label });

		expect(screen.getByRole('button', { name: 'Last 2 years' }).className).toContain('primary');
	});

	it('is a link that looks like a button with an href', () => {
		render(Button, { href: '/files', children: label });

		expect(screen.getByRole('link', { name: 'Last 2 years' }).getAttribute('href')).toBe('/files');
	});
});

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

	it('reads as a pressed button when it toggles', () => {
		render(Chip, { href: '?', on: true, toggle: true, children: label });

		const chip = screen.getByRole('button', { name: 'Last 2 years' });
		expect(chip.getAttribute('aria-pressed')).toBe('true');
	});
});

describe('a filter modal', () => {
	const opened = async () => {
		render(FilterModal, { params: ['span'], children: label });
		await fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
		return within(await screen.findByRole('dialog', { name: 'Filter' }));
	};

	it('opens from a Filter button, and Close hides it', async () => {
		const panel = await opened();

		await fireEvent.click(panel.getByRole('button', { name: 'Close' }));
		await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filter' })).toBeNull());
	});

	it('hides once Apply is pressed', async () => {
		const panel = await opened();

		await fireEvent.click(panel.getByRole('button', { name: 'Apply' }));
		await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filter' })).toBeNull());
	});

	it('resets by clearing its own parameters, keeping the rest of the query', async () => {
		const panel = await opened();

		expect(panel.getByRole('link', { name: 'Reset' }).getAttribute('href')).toBe('?ledger=a');
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
