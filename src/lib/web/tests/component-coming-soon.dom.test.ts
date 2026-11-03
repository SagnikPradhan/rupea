import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ComingSoon from '#lib/web/components/coming-soon/coming-soon.svelte';

describe('a coming soon block', () => {
	it('is a small card in a panel', () => {
		const { container } = render(ComingSoon);

		expect(screen.getByText('Coming soon')).toBeTruthy();
		expect(container.querySelector('.page')).toBeNull();
	});

	it('fills the page when it is the whole page', () => {
		const { container } = render(ComingSoon, { page: true });

		expect(container.querySelector('.page')).toBeTruthy();
	});
});
