import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { fault } from '#lib/server/shared/result/error.ts';
import Issues from '#lib/web/components/app-issues/app-issues.svelte';

const unbalanced = fault('ParseUnbalancedTransaction', {
	location: 'a.rupea:4, b.rupea',
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
		expect(screen.getByRole('link', { name: 'a.rupea:4' }).getAttribute('href')).toBe(
			'/l/h/files?file=a.rupea&line=4',
		);
		expect(screen.getByRole('link', { name: 'b.rupea' }).getAttribute('href')).toBe(
			'/l/h/files?file=b.rupea',
		);
	});

	it('reports assertions as status, after the problems', () => {
		const assertion = fault('BalanceAssertionFailed', {
			location: 'a.rupea:9',
			account: 'Assets:Bank',
			expected: '10',
			actual: '20',
		});
		render(Issues, { handle: 'h', errors: [assertion, unbalanced] });

		const lists = screen.getAllByRole('list');
		expect(lists).toHaveLength(2);
		expect(lists[0]?.querySelector('[role="alert"]')).toBeTruthy();
		expect(lists[1]?.querySelector('[role="status"]')).toBeTruthy();
	});

	it('shows an error once however many queries returned it', () => {
		const invalid = fault('ParseInvalidPosting', { location: 'a.rupea:4' });
		render(Issues, { handle: 'h', errors: [invalid, invalid, { ...invalid }] });

		expect(screen.getAllByRole('alert')).toHaveLength(1);
	});

	it('shows errors at different locations apart', () => {
		const first = fault('ParseInvalidPosting', { location: 'a.rupea:4' });
		const second = fault('ParseInvalidPosting', { location: 'a.rupea:5' });
		render(Issues, { handle: 'h', errors: [first, second] });

		expect(screen.getAllByRole('alert')).toHaveLength(2);
	});

	it('shows errors of one type and location apart when another field differs', () => {
		const bank = fault('BalanceAssertionFailed', {
			location: 'a.rupea:9',
			account: 'Assets:Bank',
			expected: '10',
			actual: '20',
		});
		const cash = fault('BalanceAssertionFailed', {
			location: 'a.rupea:9',
			account: 'Assets:Cash',
			expected: '10',
			actual: '20',
		});
		render(Issues, { handle: 'h', errors: [bank, cash] });

		expect(screen.getAllByRole('status')).toHaveLength(2);
	});

	it('shows errors of different types at one location apart', () => {
		const invalid = fault('ParseInvalidPosting', { location: 'a.rupea:4' });
		const unbalancedHere = fault('ParseUnbalancedTransaction', {
			location: 'a.rupea:4',
			residual: '20',
		});
		render(Issues, { handle: 'h', errors: [invalid, unbalancedHere] });

		expect(screen.getAllByRole('alert')).toHaveLength(2);
	});
});
