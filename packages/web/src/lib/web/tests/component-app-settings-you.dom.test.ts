import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { saveUser, sendCode } from '#lib/endpoints/auth.remote.ts';
import { refreshAll } from '$app/navigation';
import SettingsYou from '#lib/web/components/app-settings-you/app-settings-you.svelte';

vi.mock('$app/navigation', () => ({ refreshAll: vi.fn() }));
vi.mock('#lib/endpoints/auth.remote.ts', () => ({
	saveUser: vi.fn(),
	sendCode: vi.fn(),
}));

const user = { id: 'u1', email: 'ada@example.com', username: 'ada' };

const open = (local = false) =>
	render(SettingsYou, { username: 'ada', email: 'ada@example.com', local });

const type = (label: RegExp, value: string) =>
	fireEvent.input(screen.getByLabelText(label), { target: { value } });

describe('changing your username', () => {
	it('saves the name as typed and refreshes the bar', async () => {
		vi.mocked(saveUser).mockResolvedValue({ data: user, errors: [] } as never);
		open();

		await type(/Username/, 'Countess');
		await fireEvent.click(screen.getByRole('button', { name: 'Save username' }));

		expect(await screen.findByText('Saved.')).toBeTruthy();
		expect(saveUser).toHaveBeenCalledWith({ username: 'countess' });
		expect(refreshAll).toHaveBeenCalled();
	});

	it('asks again for a name with spaces, without saving it', async () => {
		vi.mocked(saveUser).mockClear();
		open();

		await type(/Username/, 'ada lovelace');
		await fireEvent.click(screen.getByRole('button', { name: 'Save username' }));

		expect(await screen.findByText('Use 3 to 32 letters, digits or dashes.')).toBeTruthy();
		expect(saveUser).not.toHaveBeenCalled();
	});

	it('says when someone already has the name', async () => {
		vi.mocked(saveUser).mockResolvedValue({
			data: null,
			errors: [{ type: 'NameTaken', name: 'grace' }],
		} as never);
		open();

		await type(/Username/, 'grace');
		await fireEvent.click(screen.getByRole('button', { name: 'Save username' }));

		expect(await screen.findByText('Someone already has the name grace.')).toBeTruthy();
	});
});

describe('changing your email', () => {
	it('mails a code to the new address, then confirms with it', async () => {
		vi.mocked(sendCode).mockResolvedValue({ data: null, errors: [] } as never);
		vi.mocked(saveUser).mockResolvedValue({ data: user, errors: [] } as never);
		open();

		await type(/Email/, 'lovelace@example.com');
		await fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
		await type(/Code/, '123456');
		await fireEvent.click(await screen.findByRole('button', { name: 'Confirm email' }));

		expect(await screen.findByText('Saved.')).toBeTruthy();
		expect(sendCode).toHaveBeenCalledWith({ email: 'lovelace@example.com' });
		expect(saveUser).toHaveBeenCalledWith({ email: 'lovelace@example.com', code: '123456' });
	});

	it('says when another account uses the address', async () => {
		vi.mocked(sendCode).mockResolvedValue({ data: null, errors: [] } as never);
		vi.mocked(saveUser).mockResolvedValue({
			data: null,
			errors: [{ type: 'EmailTaken', email: 'grace@example.com' }],
		} as never);
		open();

		await type(/Email/, 'grace@example.com');
		await fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
		await type(/Code/, '123456');
		await fireEvent.click(await screen.findByRole('button', { name: 'Confirm email' }));

		expect(await screen.findByText('Another account already uses grace@example.com.')).toBeTruthy();
	});

	it('goes back to the address when asked for another', async () => {
		vi.mocked(sendCode).mockResolvedValue({ data: null, errors: [] } as never);
		open();

		await type(/Email/, 'lovelace@example.com');
		await fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Use another email' }));

		expect(screen.queryByLabelText(/Code/)).toBeNull();
		expect(screen.getByRole('button', { name: 'Email me a code' })).toBeTruthy();
	});

	it('saves the address without a code while sign-in is off', async () => {
		vi.mocked(sendCode).mockClear();
		vi.mocked(saveUser).mockResolvedValue({ data: user, errors: [] } as never);
		open(true);

		await type(/Email/, 'lovelace@example.com');
		await fireEvent.click(screen.getByRole('button', { name: 'Save email' }));

		expect(await screen.findByText('Saved.')).toBeTruthy();
		expect(sendCode).not.toHaveBeenCalled();
		expect(saveUser).toHaveBeenCalledWith({ email: 'lovelace@example.com', code: '' });
	});
});
