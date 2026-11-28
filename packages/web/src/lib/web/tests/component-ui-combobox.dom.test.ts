import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Combobox from '#lib/web/components/ui-combobox/ui-combobox.svelte';

const options = ['bank.rupea', 'cash.rupea', 'other.rupea'];

const shown = (value = '') => {
	const onchange = vi.fn();
	const onfocus = vi.fn();
	render(Combobox, { value, options, onchange, onfocus });
	return { onchange, onfocus, user: userEvent.setup() };
};

describe('the combobox', () => {
	it('suggests everything on coming to it, and tells the page', async () => {
		const { user, onfocus } = shown('bank.rupea');
		await user.click(screen.getByRole('combobox'));

		expect(onfocus).toHaveBeenCalled();
		expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(options);
	});

	it('hands over what is typed, which need not be one of the suggestions', async () => {
		const { user, onchange } = shown();
		await user.type(screen.getByRole('combobox'), 'x');

		expect(onchange).toHaveBeenLastCalledWith('x');
	});

	it('narrows the suggestions by what is typed, and hands over the one picked', async () => {
		const { user, onchange } = shown('oth');
		await user.click(screen.getByRole('combobox'));
		await user.type(screen.getByRole('combobox'), 'e');
		expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['other.rupea']);

		await user.click(screen.getByRole('option', { name: 'other.rupea' }));
		expect(onchange).toHaveBeenLastCalledWith('other.rupea');
	});
});
