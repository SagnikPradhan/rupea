import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import AccountName from '#lib/web/components/app-account-name/app-account-name.svelte';

describe('an account name', () => {
	it('writes the account by its name after the initials of what it is under', () => {
		const { container } = render(AccountName, { account: 'Assets:Investments:GOLDBEES' });

		expect(container.querySelector('.name')?.textContent).toBe('A:I:GOLDBEES');
		expect(container.querySelector('.prefix')?.textContent).toBe('A:I:');
	});

	it('spells out what it is under when asked to', () => {
		const { container } = render(AccountName, { account: 'Assets:Bank', full: true });

		expect(container.querySelector('.prefix')?.textContent).toBe('Assets:');
	});

	it('indents by how deep it is', () => {
		const { container } = render(AccountName, { account: 'Assets:Bank', depth: 2 });

		expect(container.querySelector<HTMLElement>('.name')?.style.getPropertyValue('--depth')).toBe(
			'2',
		);
	});
});
