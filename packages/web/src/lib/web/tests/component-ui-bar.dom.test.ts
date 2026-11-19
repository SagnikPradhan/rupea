import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Bar from '#lib/web/components/ui-bar/ui-bar.svelte';
import BarRow from '#lib/web/components/ui-bar-row/ui-bar-row.svelte';

describe('a bar', () => {
	it('fills its share of the track, never past it', () => {
		const { container, rerender } = render(Bar, { share: 0.25 });
		const fill = () => container.querySelector<HTMLElement>('.fill')?.style.width;

		expect(fill()).toBe('25%');
		void rerender({ share: 3 });
		expect(fill()).toBe('100%');
	});
});

describe('a bar with a limit', () => {
	it('draws no tick or over part without a limit', () => {
		const { container } = render(Bar, { share: 0.5 });

		expect(container.querySelector('.tick')).toBeNull();
		expect(container.querySelector('.over')).toBeNull();
	});

	it('fills ink up to the limit, the rest as over, and ticks the limit', () => {
		const { container } = render(Bar, { share: 1, limit: 0.5 });
		const style = (c: string) => container.querySelector<HTMLElement>(c)?.style;

		expect(style('.fill')?.width).toBe('50%');
		expect(style('.over')?.left).toBe('50%');
		expect(style('.over')?.width).toBe('50%');
		expect(style('.tick')?.left).toBe('50%');
	});

	it('keeps the fill below the limit and draws no over part', () => {
		const { container } = render(Bar, { share: 0.25, limit: 0.5 });

		expect(container.querySelector<HTMLElement>('.fill')?.style.width).toBe('25%');
		expect(container.querySelector<HTMLElement>('.over')?.style.width).toBe('0%');
	});
});

describe('a bar row', () => {
	it('passes its limit to the bar and links its name', () => {
		const { container } = render(BarRow, {
			name: 'Food',
			href: '?budget=Expenses:Food',
			figure: '150%',
			share: 1,
			limit: 0.5,
		});

		expect(container.querySelector('.tick')).toBeTruthy();
		expect(screen.getByText('Food').closest('a')?.getAttribute('href')).toBe(
			'?budget=Expenses:Food',
		);
	});

	it('puts a prefix before a name, linked or not', () => {
		render(BarRow, { name: 'Food', prefix: 'Expenses:', figure: '1', share: 0.5 });
		render(BarRow, { name: 'Rent', prefix: 'Expenses:', href: '?a=1', figure: '2', share: 0.5 });

		expect(screen.getAllByText('Expenses:')).toHaveLength(2);
		expect(screen.getByText('Rent').closest('a')?.getAttribute('href')).toBe('?a=1');
	});

	it('names what it measures, its figures and its bar', () => {
		const { container } = render(BarRow, {
			name: 'GOLDBEES',
			detail: 'gain 13,00,000',
			figure: '+48.1%',
			tone: 'positive',
			share: 1,
		});

		expect(screen.getByText('GOLDBEES')).toBeTruthy();
		expect(screen.getByText('gain 13,00,000')).toBeTruthy();
		expect(screen.getByText('+48.1%').className).toContain('positive');
		expect(container.querySelector('.fill')).toBeTruthy();
	});
});
