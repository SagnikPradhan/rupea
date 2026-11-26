import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { listCurrencies, saveBase } from '#lib/endpoints/ledger.remote.ts';
import { refreshAll } from '$app/navigation';
import { answer } from '#tests/shared/queries.ts';
import SettingsCurrency from '#lib/web/components/app-settings-currency/app-settings-currency.svelte';

vi.mock('$app/navigation', () => ({ refreshAll: vi.fn() }));
vi.mock('#lib/endpoints/ledger.remote.ts', () => ({ listCurrencies: vi.fn(), saveBase: vi.fn() }));

const open = (currencies: string[]) => {
	vi.mocked(listCurrencies).mockReturnValue(answer(currencies));
	render(SettingsCurrency, { handle: 'h', base: 'INR' });
};

describe('the base currency in settings', () => {
	it('offers only the currencies a price links to, the base chosen', async () => {
		open(['EUR', 'INR', 'USD']);

		const picker = (await screen.findByLabelText(/Base currency/)) as HTMLSelectElement;
		expect([...picker.options].map((o) => o.value)).toEqual(['EUR', 'INR', 'USD']);
		expect(picker.value).toBe('INR');
	});

	it('saves the currency chosen and refreshes the ledgers', async () => {
		vi.mocked(saveBase).mockResolvedValue({ data: null, errors: [] } as never);
		open(['INR', 'USD']);

		await userEvent.selectOptions(await screen.findByLabelText(/Base currency/), 'USD');
		await fireEvent.click(screen.getByRole('button', { name: 'Save currency' }));

		expect(await screen.findByText('Saved.')).toBeTruthy();
		expect(saveBase).toHaveBeenCalledWith({ handle: 'h', base: 'USD' });
		expect(refreshAll).toHaveBeenCalled();
	});

	it('says when the currency could not be written', async () => {
		vi.mocked(saveBase).mockResolvedValue({
			data: null,
			errors: [{ type: 'CannotWriteBase', path: 'main.rupea' }],
		} as never);
		open(['INR']);

		await fireEvent.click(await screen.findByRole('button', { name: 'Save currency' }));

		expect(
			await screen.findByText(
				'The currency wouldn’t read back from main.rupea. Check the lines at its top.',
			),
		).toBeTruthy();
	});
});
