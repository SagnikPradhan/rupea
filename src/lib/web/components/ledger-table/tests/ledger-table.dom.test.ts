import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import Account from '#lib/web/components/ledger-table/account.svelte';
import Amount from '#lib/web/components/ledger-table/amount.svelte';
import Source from '#lib/web/components/ledger-table/source.svelte';

const cell = () => screen.getByRole('cell');
const textOf = (e: HTMLElement) => e.textContent?.replace(/\s+/g, ' ').trim();

describe('an amount', () => {
	it('groups its digits', () => {
		render(Amount, { value: '-1250.5' });
		expect(textOf(cell())).toBe('-1,250.50');
		expect(cell().classList.contains('negative')).toBe(true);
	});

	it('is positive only when signed and above zero', () => {
		render(Amount, { value: '10', signed: true });
		expect(cell().classList.contains('positive')).toBe(true);
	});

	it('is plain when it is not signed', () => {
		render(Amount, { value: '10' });
		expect(cell().classList.contains('positive')).toBe(false);
	});

	it('shows a gain beneath its value, by its sign', () => {
		render(Amount, { value: '1800', gain: '-300' });
		expect(textOf(cell())).toBe('1,800.00 -300.00');
		expect(cell().querySelector('small')?.classList.contains('negative')).toBe(true);
	});

	it('rounds to two places, with every digit in its tooltip', () => {
		render(Amount, { value: '1250.5678' });
		expect(textOf(cell())).toBe('1,250.57');
		expect(cell().title).toBe('1,250.5678');
	});

	it('keeps four places for units, and no tooltip when nothing is rounded', () => {
		render(Amount, { value: '7.25', units: true });
		expect(textOf(cell())).toBe('7.25');
		expect(cell().hasAttribute('title')).toBe(false);
	});

	it('shows its children without a value', () => {
		const children = createRawSnippet(() => ({ render: () => '<span>unpriced</span>' }));
		render(Amount, { value: null, children });
		expect(textOf(cell())).toBe('unpriced');
	});
});

describe('an account', () => {
	it('mutes its parents, and lets the name break after each colon', () => {
		const { container } = render(Account, { account: 'Assets:Bank:Savings' });

		expect(container.textContent).toBe('Assets:Bank:Savings');
		expect(container.querySelector('.parent')?.textContent).toBe('Assets:Bank:');
		expect(container.querySelectorAll('wbr')).toHaveLength(2);
	});
});

describe('a source', () => {
	it('names the file by its last part, and links to its line', () => {
		render(Source, { handle: 'h', file: 'bank/aug.rupee', line: 4 });

		const link = screen.getByRole('link', { name: 'bank/aug.rupee:4' });
		expect(link.textContent?.trim()).toBe('aug.rupee:4');
		expect(link.getAttribute('href')).toBe('/l/h/files?file=bank%2Faug.rupee&line=4');
	});
});
