import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PageSketch from '#lib/web/components/ui-page-sketch/ui-page-sketch.svelte';

const sketched = (page: 'home' | 'spending' | 'worth' | 'ledger') =>
	render(PageSketch, { page }).container.querySelector('svg')!;

describe('a page sketch', () => {
	it('draws bars for spending and a rising line for net worth', () => {
		expect(sketched('spending').querySelectorAll('rect')).toHaveLength(20);
		expect(sketched('worth').querySelector('path.line')).toBeTruthy();
	});

	it('draws rows with amounts for the ledger', () => {
		expect(sketched('ledger').querySelectorAll('rect')).toHaveLength(12);
	});

	it('stays out of what a screen reader reads', () => {
		expect(sketched('home').getAttribute('aria-hidden')).toBe('true');
	});
});
