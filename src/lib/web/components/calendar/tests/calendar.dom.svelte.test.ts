import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import Calendar from '#lib/web/components/calendar/calendar.svelte';

const ROWS = [
	{ day: '2026-10-01', total: '1000' },
	{ day: '2026-10-02', total: '0' },
	{ day: '2026-10-03', total: '-300' },
	{ day: '2026-10-04', total: '4000' },
	{ day: '2026-10-05', total: '2500' },
];

const summary = createRawSnippet((index: () => number | null) => ({
	render: () => `<p data-testid="summary"></p>`,
	setup: (node) => {
		$effect(() => {
			node.textContent = String(index());
		});
	},
}));

const drawn = () =>
	render(Calendar, {
		rows: ROWS,
		x: 'day',
		y: 'total',
		label: 'Spending',
		href: (day: string) => `/postings?from=${day}&to=${day}`,
		summary,
	});

const cellOf = (name: string) =>
	[...document.querySelectorAll('td')].find((c) => c.querySelector('.day')?.textContent === name);

describe('the calendar', () => {
	it('sets days in weeks from Monday, blank around the range', () => {
		drawn();
		const weeks = screen.getAllByRole('row').slice(1);
		const cells = weeks.map((w) => [...w.querySelectorAll('td')].map((c) => c.textContent?.trim()));

		expect(cells).toEqual([
			['', '', '', '1 Oct 1K', '2', '3 -300', '4 4K'],
			['5 2.5K', '', '', '', '', '', ''],
		]);
	});

	it('shades a day by its share of the largest, and none for refunds or nothing', () => {
		drawn();
		const shades = ['1 Oct', '2', '3', '4', '5'].map((d) => cellOf(d)?.dataset['shade']);

		expect(shades).toEqual(['1', '0', '0', '4', '3']);
		expect(cellOf('3')?.classList).toContain('negative');
	});

	it('leads each day to its postings', () => {
		drawn();
		expect(cellOf('4')?.querySelector('a')?.getAttribute('href')).toBe(
			'/postings?from=2026-10-04&to=2026-10-04',
		);
	});

	it('hands the summary the day under the cursor, or none', async () => {
		drawn();
		expect(screen.getByTestId('summary').textContent).toBe('null');

		const day = cellOf('4');
		if (!day) throw new Error('No day');
		await fireEvent.pointerEnter(day);
		expect(screen.getByTestId('summary').textContent).toBe('3');

		await fireEvent.pointerLeave(day.closest('tbody') ?? day);
		expect(screen.getByTestId('summary').textContent).toBe('null');
	});
});
