import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ChoicePicker from '#lib/web/components/choice-picker/choice-picker.svelte';
import { SCALE_LABELS } from '#lib/web/shared/choices.ts';

vi.mock('$app/state', () => ({
	page: { url: new URL('https://rupee.test/l/h/expenses?range=1y') },
}));

const picker = (current: string) =>
	render(ChoicePicker, { param: 'scale', label: 'Scale', choices: SCALE_LABELS, current });

describe('the choice picker', () => {
	it('marks the current choice', () => {
		picker('log');
		expect(screen.getByRole('navigation', { name: 'Scale' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Log' }).getAttribute('aria-current')).toBe('page');
		expect(screen.getByRole('link', { name: 'Linear' }).getAttribute('aria-current')).toBeNull();
	});

	it('swaps only its parameter, keeping the rest of the query', () => {
		picker('linear');
		expect(screen.getByRole('link', { name: 'Log' }).getAttribute('href')).toBe(
			'?range=1y&scale=log',
		);
	});
});
