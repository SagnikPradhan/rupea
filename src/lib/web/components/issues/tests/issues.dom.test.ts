import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { fault } from '#lib/server/shared/result/error.ts';
import Issues from '#lib/web/components/issues/issues.svelte';

const unbalanced = fault('ParseUnbalancedTransaction', {
	location: 'a.rupee:4, b.rupee',
	residual: '20',
});

describe('issues', () => {
	it('shows nothing without errors', () => {
		render(Issues, { handle: 'h', errors: [] });
		expect(screen.queryByRole('list')).toBeNull();
	});

	it('announces a problem and links each place it names', () => {
		render(Issues, { handle: 'h', errors: [unbalanced] });

		expect(screen.getByRole('alert').textContent).toContain('This transaction is off by 20.');
		expect(screen.getByRole('link', { name: 'a.rupee:4' }).getAttribute('href')).toBe(
			'/l/h/files?file=a.rupee&line=4',
		);
		expect(screen.getByRole('link', { name: 'b.rupee' }).getAttribute('href')).toBe(
			'/l/h/files?file=b.rupee',
		);
	});

	it('reports warnings as status rather than alerts', () => {
		render(Issues, { handle: 'h', errors: [unbalanced], warning: true });
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.getByRole('status')).toBeTruthy();
	});
});
