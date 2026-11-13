import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import Tooltip from '#lib/web/components/ui-tooltip/ui-tooltip.svelte';

const children = createRawSnippet(() => ({ render: () => '<span>Food 600</span>' }));

describe('a tooltip', () => {
	it('shows what it is given, with no chart around it', () => {
		render(Tooltip, { left: 0, top: 0, children });

		expect(screen.getByRole('tooltip').textContent).toBe('Food 600');
	});

	it('stands at the point it describes, as a percent of its container', () => {
		render(Tooltip, { left: 60, top: 40, children });
		const tip = screen.getByRole('tooltip');

		expect(tip.style.left).toBe('60%');
		expect(tip.style.top).toBe('40%');
	});
});
