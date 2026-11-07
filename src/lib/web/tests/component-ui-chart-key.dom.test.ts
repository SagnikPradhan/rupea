import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Key from '#lib/web/components/ui-chart-key/ui-chart-key.svelte';

const ENTRIES = [
	{ label: 'Food', amount: '9.5K', shade: '--color-chart-1', part: 0 },
	{ label: 'Rent', amount: '8K', shade: '--color-chart-2', part: 1 },
	{ label: 'Net worth', mark: 'primary' as const },
	{ label: 'Previous', amount: '9.8K', mark: 'reference' as const },
];

const drawn = (focus: number | null = null) => {
	const onfocus = vi.fn();
	render(Key, { entries: ENTRIES, focus, onfocus });
	return onfocus;
};

describe('the chart key', () => {
	it('lists a name beside its amount, or alone without one', () => {
		drawn();
		expect(screen.getByText('Food').closest('li')?.querySelector('data')?.textContent).toBe('9.5K');
		expect(screen.getByText('Net worth').closest('li')?.querySelector('data')).toBeNull();
	});

	it('marks a line in place of a swatch', () => {
		drawn();
		expect(screen.getByText('Food').closest('li')?.querySelector('[aria-hidden]')).not.toBeNull();
		expect(screen.getByText('Previous').closest('li')?.classList.contains('reference')).toBe(true);
		expect(screen.getByText('Previous').closest('li')?.querySelector('[aria-hidden]')).toBeNull();
	});

	it('sizes every column to the longest name', () => {
		drawn();
		expect(screen.getAllByRole('list')[0]?.style.getPropertyValue('--name')).toBe('9ch');
	});

	it('focuses a part while the pointer is on it, but not a line', async () => {
		const onfocus = drawn();

		await fireEvent.pointerEnter(screen.getByText('Rent').closest('li')!);
		expect(onfocus).toHaveBeenLastCalledWith(1);
		await fireEvent.pointerLeave(screen.getByText('Rent').closest('li')!);
		expect(onfocus).toHaveBeenLastCalledWith(null);

		onfocus.mockClear();
		await fireEvent.pointerEnter(screen.getByText('Net worth').closest('li')!);
		expect(onfocus).not.toHaveBeenCalled();
	});

	it('fades the other parts while one is focused, and leaves lines alone', () => {
		drawn(0);
		expect(screen.getByText('Food').closest('li')?.classList.contains('faded')).toBe(false);
		expect(screen.getByText('Rent').closest('li')?.classList.contains('faded')).toBe(true);
		expect(screen.getByText('Net worth').closest('li')?.classList.contains('faded')).toBe(false);
	});
});
