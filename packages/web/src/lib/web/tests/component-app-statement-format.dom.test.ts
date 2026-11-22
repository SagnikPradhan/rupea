import { render, screen } from '@testing-library/svelte';
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
	grid: [],
	schema: { key: 'my-bank.yml', content: '' },
	onchange: () => {},
};

describe('describing a statement', () => {
	it('says what a starter is above the starters', async () => {
		vi.mocked(listSchemas).mockReturnValue(answer([{ key: 'hdfc-card.yml' }]));
		render(StatementFormat, props);

		const hint = await screen.findByText(/A starter is a ready-made setup/);
		const starters = screen.getByRole('group', { name: 'Starters' });
		expect(hint.compareDocumentPosition(starters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});
});
