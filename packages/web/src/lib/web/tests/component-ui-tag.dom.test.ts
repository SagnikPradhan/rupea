import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import Tag from '#lib/web/components/ui-tag/ui-tag.svelte';

const children = createRawSnippet(() => ({ render: () => '<span>not counted</span>' }));

describe('a tag', () => {
	it('shows its label', () => {
		render(Tag, { children });

		expect(screen.getByText('not counted')).toBeTruthy();
	});

	it('carries a title for the exact value', () => {
		render(Tag, { title: '12.5 units', children });

		expect(screen.getByTitle('12.5 units').textContent).toBe('not counted');
	});
});
