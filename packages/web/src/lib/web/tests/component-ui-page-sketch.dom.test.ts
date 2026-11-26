import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PageSketch from '#lib/web/components/ui-page-sketch/ui-page-sketch.svelte';

const sketched = (page: 'home' | 'spending' | 'worth' | 'transactions' | 'files') =>
	render(PageSketch, { page }).container.querySelector('svg')!;

describe('a page sketch', () => {
	it('draws bars for spending and a rising line for net worth', () => {
		expect(sketched('spending').querySelectorAll('rect')).toHaveLength(20);
		expect(sketched('worth').querySelector('path.line')).toBeTruthy();
	});

	it('draws rows for the pages that list things, with amounts only for transactions', () => {
		expect(sketched('transactions').querySelectorAll('rect')).toHaveLength(12);
		expect(sketched('files').querySelectorAll('rect')).toHaveLength(8);
	});

	it('stays out of what a screen reader reads', () => {
		expect(sketched('home').getAttribute('aria-hidden')).toBe('true');
	});
});
