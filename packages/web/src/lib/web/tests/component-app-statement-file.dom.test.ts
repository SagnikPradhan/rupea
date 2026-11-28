import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import StatementFile from '#lib/web/components/app-statement-file/app-statement-file.svelte';

describe('the original statement', () => {
	it('shows a PDF in a frame served by the original route', () => {
		render(StatementFile, { handle: 'h', statement: '20261121/card.pdf' });

		const frame = screen.getByTitle('Original statement');
		expect(frame.getAttribute('src')).toBe('/l/h/original?key=20261121%2Fcard.pdf');
	});

	it('offers any other kind of file to download', () => {
		render(StatementFile, { handle: 'h', statement: '20261121/card.xlsx' });

		expect(screen.queryByTitle('Original statement')).toBeNull();
		expect(screen.getByText('This kind of file can’t be shown here.')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Download original' }).getAttribute('href')).toBe(
			'/l/h/original?key=20261121%2Fcard.xlsx',
		);
	});
});
