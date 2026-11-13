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

describe('a bar row', () => {
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
