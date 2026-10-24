import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ScalePicker from '#lib/web/components/scale-picker/scale-picker.svelte';

vi.mock('$app/state', () => ({
	page: { url: new URL('https://rupee.test/l/h/expenses?range=1y') },
}));

describe('the scale picker', () => {
	it('marks the current scale', () => {
		render(ScalePicker, { current: 'log' });
		expect(screen.getByRole('link', { name: 'Log' }).getAttribute('aria-current')).toBe('page');
		expect(screen.getByRole('link', { name: 'Linear' }).getAttribute('aria-current')).toBeNull();
	});

	it('swaps only the scale, keeping the rest of the query', () => {
		render(ScalePicker, { current: 'linear' });
		expect(screen.getByRole('link', { name: 'Log' }).getAttribute('href')).toBe(
			'?range=1y&scale=log',
		);
	});
});
