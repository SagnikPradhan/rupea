import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findSync, resync } from '#lib/endpoints/ledger.remote.ts';
import SyncButton from '#lib/web/components/sync-button/sync-button.svelte';
import { answer } from '#tests/shared/queries.ts';
import { refreshAll } from '$app/navigation';

vi.mock('$app/navigation', () => import('#tests/shared/app-navigation.ts'));
vi.mock('#lib/endpoints/ledger.remote.ts', () => ({
	findSync: vi.fn(),
	resync: Object.assign(vi.fn(), { pending: 0 }),
}));

afterEach(() => vi.clearAllMocks());

const rendered = (latest: string | null) => {
	vi.mocked(findSync).mockReturnValue(answer(latest));
	vi.mocked(resync).mockResolvedValue({ ok: true, data: undefined, errors: [] });
	return { user: userEvent.setup(), ...render(SyncButton, { handle: 'h' }) };
};

describe('the sync button', () => {
	it('queues a sync of the ledger', async () => {
		const { user } = rendered('succeeded');
		await user.click(await screen.findByRole('button', { name: 'Sync now' }));

		expect(resync).toHaveBeenCalledWith('h');
	});

	it('waits while a sync is queued or running', async () => {
		rendered('running');

		const button = await screen.findByRole('button', { name: 'Syncing…' });
		expect(button.hasAttribute('disabled')).toBe(true);
	});

	it('reads the page again once the sync is done', async () => {
		const { rerender } = rendered('running');
		await screen.findByRole('button', { name: 'Syncing…' });

		vi.mocked(findSync).mockReturnValue(answer('succeeded'));
		await rerender({ handle: 'g' });

		await screen.findByRole('button', { name: 'Sync now' });
		expect(refreshAll).toHaveBeenCalledOnce();
	});

	it('offers a sync before the first one', async () => {
		rendered(null);

		expect(await screen.findByRole('button', { name: 'Sync now' })).toBeTruthy();
	});
});
