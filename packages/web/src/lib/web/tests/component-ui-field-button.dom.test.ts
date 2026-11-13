import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import Button from '#lib/web/components/ui-button/ui-button.svelte';
import Field from '#lib/web/components/ui-field/ui-field.svelte';

const text = (t: string) => createRawSnippet(() => ({ render: () => `<span>${t}</span>` }));
const input = createRawSnippet(() => ({ render: () => '<input />' }));

describe('a field', () => {
	it('names its box by the label and describes it by the hint', () => {
		render(Field, { label: 'Date', hint: 'The day it happened.', children: input });

		const box = screen.getByRole('textbox', { name: 'Date' });
		const hint = document.getElementById(box.getAttribute('aria-describedby') ?? '');

		expect(hint?.textContent).toBe('The day it happened.');
	});
});

describe('a destructive button', () => {
	it('is marked as destructive, as a button or a link', () => {
		render(Button, { destructive: true, children: text('Delete') });
		render(Button, { destructive: true, href: '/x', children: text('Remove') });

		expect(screen.getByRole('button', { name: 'Delete' }).classList).toContain('destructive');
		expect(screen.getByRole('link', { name: 'Remove' }).classList).toContain('destructive');
	});
});
