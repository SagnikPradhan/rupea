import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import ChartSummary from '#lib/web/components/ui-chart-summary/ui-chart-summary.svelte';
import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
import PageSection from '#lib/web/components/ui-page-section/ui-page-section.svelte';
import Kpi from '#lib/web/components/ui-kpi/ui-kpi.svelte';
import KpiStrip from '#lib/web/components/ui-kpi-strip/ui-kpi-strip.svelte';

describe('a kpi', () => {
	it('puts the figure over the label over its context', () => {
		render(Kpi, { label: 'Assets', figure: '1,00,000', detail: 'in 2 groups' });

		expect(screen.getByText('Assets')).toBeTruthy();
		expect(screen.getByText('1,00,000')).toBeTruthy();
		expect(screen.getByText('in 2 groups').className).not.toContain('positive');
	});

	it('shows nothing for a figure that is coming soon', () => {
		render(Kpi, { label: 'Cash cushion', soon: true });

		expect(screen.queryByText('Cash cushion')).toBeNull();
		expect(screen.queryByText('Coming soon')).toBeNull();
	});

	it('colours the context only when told it is a gain', () => {
		render(Kpi, { label: 'Saved', figure: '57,000', detail: '29% of income', tone: 'positive' });

		expect(screen.getByText('29% of income').className).toContain('positive');
	});

	it('has no context line without one', () => {
		const { container } = render(Kpi, { label: 'Files', figure: '122' });

		expect(container.querySelectorAll('p')).toHaveLength(2);
	});
});

describe('a kpi strip', () => {
	it('holds the figures of a page under one name', () => {
		const children = createRawSnippet(() => ({ render: () => '<p>one</p>' }));
		render(KpiStrip, { children });

		expect(screen.getByRole('region', { name: 'Figures' }).textContent).toBe('one');
	});

	it('takes a name of its own when a page has more than one', () => {
		const children = createRawSnippet(() => ({ render: () => '<p>one</p>' }));
		render(KpiStrip, { label: 'Income figures', children });

		expect(screen.getByRole('region', { name: 'Income figures' })).toBeTruthy();
	});
});

describe('a chart summary', () => {
	it('puts a figure under its label, with a line of context', () => {
		const children = createRawSnippet(() => ({ render: () => '<span>vs previous</span>' }));
		render(ChartSummary, {
			id: 'worth',
			label: 'Net worth',
			figure: '2,70,000',
			exact: '270000.00',
			children,
		});

		expect(screen.getByRole('heading', { name: 'Net worth' }).id).toBe('worth');
		expect(screen.getByText('2,70,000').getAttribute('title')).toBe('270000.00');
		expect(screen.getByText('vs previous')).toBeTruthy();
	});

	it('heads a section when it leads one', () => {
		const children = createRawSnippet(() => ({ render: () => '<span>this year</span>' }));
		const { container } = render(ChartSummary, {
			id: 'spending',
			label: 'Spent',
			figure: '7,00,000',
			lead: true,
			children,
		});

		expect(container.querySelector('.summary')?.classList.contains('lead')).toBe(true);
	});
});

describe('a panel grid', () => {
	it('holds its panels', () => {
		const children = createRawSnippet(() => ({ render: () => '<p>panel</p>' }));
		render(PanelGrid, { children });

		expect(screen.getByText('panel')).toBeTruthy();
	});
});

describe('a page section', () => {
	it('holds one part of a page under an id the navigation links to', () => {
		const children = createRawSnippet(() => ({ render: () => '<p>owed</p>' }));
		const { container } = render(PageSection, { id: 'owed', title: 'Owed', children });

		expect(screen.getByRole('region', { name: 'Owed' }).id).toBe('owed');
		expect(container.querySelector('section#owed p')?.textContent).toBe('owed');
	});
});
