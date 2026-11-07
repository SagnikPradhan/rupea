import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Invested from '#lib/web/components/app-invested/app-invested.svelte';

describe('the value against cost chart', () => {
	it('draws nothing before there is a day', () => {
		render(Invested, { invested: [] });
		expect(screen.queryByRole('figure')).toBeNull();
	});

	it('names the gain of the last day beside the value, and keys the cost', () => {
		render(Invested, {
			invested: [
				{ day: '2026-01-01', value: '1000', cost: '1000' },
				{ day: '2026-02-01', value: '1500', cost: '1000' },
			],
		});

		const gain = screen.getByText(/^Gain \+500/);
		expect(gain.classList.contains('positive')).toBe(true);
		expect(gain.textContent).toContain('(+50%)');
		expect(screen.getByRole('figure').querySelector('path.gained')).toBeTruthy();
		expect(screen.getByText(/^Cost/)).toBeTruthy();
	});

	it('marks a loss as negative', () => {
		render(Invested, {
			invested: [
				{ day: '2026-01-01', value: '1000', cost: '1000' },
				{ day: '2026-02-01', value: '800', cost: '1000' },
			],
		});

		expect(screen.getByText(/^Gain -200/).classList.contains('negative')).toBe(true);
	});
});
