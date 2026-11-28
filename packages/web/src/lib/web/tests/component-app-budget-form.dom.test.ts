import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { saveBudget } from '#lib/endpoints/accounts.remote.ts';
import BudgetForm from '#lib/web/components/app-budget-form/app-budget-form.svelte';

vi.mock('#lib/endpoints/accounts.remote.ts', () => ({
	saveBudget: Object.assign(vi.fn(), { pending: 0 }),
}));

const user = userEvent.setup();

const props = (more: Record<string, unknown> = {}) => ({
	handle: 'h',
	day: '2026-11-19',
	shown: { from: '2026-06-01', to: '2026-11-19' },
	account: 'Expenses:Food',
	accounts: [],
	current: {},
	oncancel: vi.fn(),
	...more,
});

const saved = () =>
	vi.mocked(saveBudget).mockResolvedValue({
		data: { file: 'main.rupea', written: 'B * Expenses:Food' },
		errors: [],
	} as never);

const limit = (value: string) =>
	fireEvent.input(screen.getByLabelText(/Limit/), { target: { value } });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));
const sent = () => vi.mocked(saveBudget).mock.lastCall?.[0].form;

describe('the budget form', () => {
	it('starts a monthly budget on the 25th from the latest 25th', async () => {
		saved();
		render(BudgetForm, props());
		await limit('8000');
		await fireEvent.input(screen.getByLabelText(/Starts on/), { target: { value: '25' } });
		await save();

		expect(await screen.findByText('Saved in main.rupea')).toBeTruthy();
		expect(sent()).toEqual({
			account: 'Expenses:Food',
			entries: [
				['limit', '8000'],
				['start', '2026-10-25'],
			],
		});
	});

	it('sets a yearly budget from April with the period and the April date', async () => {
		saved();
		render(BudgetForm, props());
		await limit('90000');
		await fireEvent.click(screen.getByRole('button', { name: 'Each year' }));
		await user.click(screen.getByRole('combobox', { name: /Starts on/ }));
		await user.click(await screen.findByRole('option', { name: 'April' }));
		await save();

		await screen.findByText('Saved in main.rupea');
		expect(sent()?.entries).toEqual([
			['limit', '90000'],
			['period', 'year'],
			['start', '2026-04-01'],
		]);
	});

	it('sends no start for a monthly budget on the 1st', async () => {
		saved();
		render(BudgetForm, props());
		await limit('8000');
		await save();

		await screen.findByText('Saved in main.rupea');
		expect(sent()?.entries).toEqual([['limit', '8000']]);
	});

	it('fills in what the budget has now and keeps the keys it does not know', async () => {
		saved();
		render(BudgetForm, props({ current: { limit: '5000', note: 'hold' } }));

		expect((screen.getByLabelText(/Limit/) as HTMLInputElement).value).toBe('5000');
		await save();

		await screen.findByText('Saved in main.rupea');
		expect(sent()?.entries).toEqual([
			['limit', '5000'],
			['note', 'hold'],
		]);
	});

	it('picks the account when adding', async () => {
		saved();
		render(BudgetForm, props({ account: '', accounts: ['Expenses:Food', 'Expenses:Rent'] }));
		await user.click(screen.getByRole('combobox', { name: /Account/ }));
		await user.click(await screen.findByRole('option', { name: 'Expenses:Rent' }));
		await limit('100');
		await save();

		await screen.findByText('Saved in main.rupea');
		expect(sent()?.account).toBe('Expenses:Rent');
	});

	it('keeps a start it was not asked to change when only the limit changes', async () => {
		saved();
		render(BudgetForm, props({ current: { limit: '5000', start: '2025-03-15' } }));
		await limit('6000');
		await save();

		await screen.findByText('Saved in main.rupea');
		expect(sent()?.entries).toEqual([
			['limit', '6000'],
			['start', '2025-03-15'],
		]);
	});

	it('writes the new date when the day changes', async () => {
		saved();
		render(BudgetForm, props({ current: { limit: '5000', start: '2025-03-15' } }));
		await fireEvent.input(screen.getByLabelText(/Starts on/), { target: { value: '20' } });
		await save();

		await screen.findByText('Saved in main.rupea');
		expect(sent()?.entries).toEqual([
			['limit', '5000'],
			['start', '2026-10-20'],
		]);
	});

	it('opens a start written in another format without throwing', () => {
		render(BudgetForm, props({ current: { limit: '5000', start: '01/04/2026' } }));

		expect((screen.getByLabelText(/Starts on/) as HTMLInputElement).value).toBe('1');
	});

	it('picks the month of a yearly budget and logs nothing', async () => {
		const log = vi.spyOn(console, 'log');
		render(BudgetForm, props());
		await fireEvent.click(screen.getByRole('button', { name: 'Each year' }));
		await user.click(screen.getByRole('combobox', { name: /Starts on/ }));
		await user.click(await screen.findByRole('option', { name: 'July' }));

		expect(screen.getByRole('combobox', { name: /Starts on/ }).textContent).toContain('July');
		expect(log).not.toHaveBeenCalled();
	});

	it('opens a yearly budget on its month and goes back to a monthly one on the 1st', async () => {
		render(BudgetForm, props({ current: { limit: '5000', period: 'year', start: '2026-04-01' } }));

		expect(screen.getByRole('combobox', { name: /Starts on/ }).textContent).toContain('April');
		await fireEvent.click(screen.getByRole('button', { name: 'Each month' }));

		expect((screen.getByLabelText(/Starts on/) as HTMLInputElement).value).toBe('1');
	});

	it('asks for a day from 1 to 31 before saving', async () => {
		vi.mocked(saveBudget).mockClear();
		render(BudgetForm, props());
		await limit('8000');
		await fireEvent.input(screen.getByLabelText(/Starts on/), { target: { value: '32' } });
		await save();

		expect(await screen.findByText('Pick a day from 1 to 31.')).toBeTruthy();
		expect(vi.mocked(saveBudget)).not.toHaveBeenCalled();
	});

	it('names the range the budgets are shown over, so they list again', async () => {
		saved();
		render(BudgetForm, props());
		await limit('8000');
		await save();

		await screen.findByText('Saved in main.rupea');
		expect(vi.mocked(saveBudget).mock.lastCall?.[0]).toMatchObject({
			handle: 'h',
			from: '2026-06-01',
			day: '2026-11-19',
		});
	});

	it('asks for a limit before saving', async () => {
		vi.mocked(saveBudget).mockClear();
		render(BudgetForm, props());
		await save();

		expect(await screen.findByText('Check the budget against the hints.')).toBeTruthy();
		expect(vi.mocked(saveBudget)).not.toHaveBeenCalled();
	});

	it('shows what went wrong saving', async () => {
		vi.mocked(saveBudget).mockResolvedValue({
			data: undefined,
			errors: [{ type: 'ParseInvalidPosting', location: 'main.ledger:3' }],
		} as never);
		render(BudgetForm, props());
		await limit('8000');
		await save();

		expect(await screen.findByText('This posting can’t be read.')).toBeTruthy();
		expect(screen.queryByText(/^Saved in/)).toBeNull();
	});

	it('shows the line it wrote', async () => {
		saved();
		render(BudgetForm, props());
		await limit('8000');
		await save();

		expect(await screen.findByText('B * Expenses:Food')).toBeTruthy();
	});

	it('hands cancelling back to the page', async () => {
		const oncancel = vi.fn();
		render(BudgetForm, props({ oncancel }));

		await user.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(oncancel).toHaveBeenCalledOnce();
	});
});
