import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { listSchemas } from '#lib/endpoints/schemas.remote.ts';
import { answer } from '#tests/shared/queries.ts';
import StatementFormat from '#lib/web/components/app-statement-format/app-statement-format.svelte';

vi.mock('#lib/endpoints/schemas.remote.ts', () => ({
	deleteSchema: vi.fn(),
	listSchemas: vi.fn(),
	readSchema: vi.fn(),
	saveSchema: Object.assign(vi.fn(), { pending: 0 }),
}));

const props = {
	handle: 'g',
	schema: { key: 'my-bank.yml', content: '' },
	onchange: () => {},
};

describe('describing a statement', () => {
	it('suggests the saved starters as its name', async () => {
		vi.mocked(listSchemas).mockReturnValue(answer([{ key: 'hdfc-card.yml' }]));
		const user = userEvent.setup();
		render(StatementFormat, props);

		await user.click(await screen.findByRole('combobox', { name: 'Name' }));

		expect(await screen.findByRole('option', { name: 'hdfc-card.yml' })).toBeTruthy();
	});
});
