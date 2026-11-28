import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import WizardFooter from '#lib/web/components/ui-wizard-footer/ui-wizard-footer.svelte';

const text = (label: string) =>
	createRawSnippet(() => ({ render: () => `<button>${label}</button>` }));

describe('a wizard footer', () => {
	it('puts the way out on the left and the main action on the right', () => {
		render(WizardFooter, { back: text('Back'), next: text('Next') });

		const [left, right] = screen.getByRole('contentinfo').children;
		expect(left?.textContent).toBe('Back');
		expect(right?.textContent).toBe('Next');
	});

	it('keeps the main action on the right with nothing on the left', () => {
		render(WizardFooter, { next: text('Next') });

		const [left, right] = screen.getByRole('contentinfo').children;
		expect(left?.textContent).toBe('');
		expect(right?.textContent).toBe('Next');
	});
});
