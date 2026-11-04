import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import Statement from '#lib/web/components/app-statement/app-statement.svelte';
import StatementRow from '#lib/web/components/app-statement/app-statement-row.svelte';

const rows = createRawSnippet(() => ({
	render: () => '<tr><td>Salary</td><td>1,95,000</td></tr>',
}));

describe('a statement', () => {
	it('titles the names and each column', () => {
		render(Statement, { head: 'In rupees', columns: ['October', 'September'], children: rows });

		const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
		expect(headers).toEqual(['In rupees', 'October', 'September']);
	});

	it('lets the title span the amount when there are no columns', () => {
		render(Statement, { head: 'Assets', children: rows });

		expect(screen.getByRole('columnheader').getAttribute('colspan')).toBe('2');
	});
});

describe('a statement row', () => {
	const body = () =>
		document.body
			.appendChild(document.createElement('table'))
			.appendChild(document.createElement('tbody'));

	it('shows its name, each amount in whole rupees, and the change as written', () => {
		const target = body();
		render(StatementRow, {
			props: { name: 'Salary', values: ['195000.50', '180000'], change: '+15,000' },
			target,
		});

		const cells = [...target.querySelectorAll('td')].map((c) => c.textContent?.trim());
		expect(cells).toEqual(['Salary', '1,95,001', '1,80,000', '+15,000']);
	});

	it('sits under a line when it is a total', () => {
		const target = body();
		render(StatementRow, { props: { name: 'Saved', values: ['0'], total: true }, target });

		expect(target.querySelector('tr')?.className).toContain('total');
	});
});
