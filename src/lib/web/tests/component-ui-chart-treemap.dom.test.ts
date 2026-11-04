import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import TreemapChart from '#lib/web/components/ui-chart-treemap/ui-chart-treemap.svelte';

type Tile = { key: string; label: string; amount: number; tiles: Tile[] };

const tile = (label: string, amount: number, tiles: Tile[] = []): Tile => ({
	key: label,
	label,
	amount,
	tiles,
});

const ASSETS = tile('Assets', 1000, [
	tile('Bank', 600),
	tile('Broker', 400, [tile('INFY', 300), tile('TCS', 100)]),
]);

/** The boxes directly inside an element, each placed as a percent of its group. */
const boxesIn = (parent: Element) =>
	[...parent.querySelectorAll<HTMLElement>(':scope > .box')].map((b) => ({
		box: b,
		label: b.querySelector('.name')?.textContent,
		left: parseFloat(b.style.left),
		top: parseFloat(b.style.top),
		width: parseFloat(b.style.width),
		height: parseFloat(b.style.height),
	}));

const drawn = (t = ASSETS) => {
	render(TreemapChart, { tile: t, label: 'Holdings' });
	return screen.getByRole('img', { name: 'Holdings' });
};

describe('the treemap chart', () => {
	it('sizes the boxes by what they hold, filling the chart', () => {
		const [bank, broker] = boxesIn(drawn());

		expect([bank?.label, broker?.label]).toEqual(['Bank', 'Broker']);
		expect(bank!.width + broker!.width).toBeCloseTo(100);
		expect((bank!.width * bank!.height) / (broker!.width * broker!.height)).toBeCloseTo(1.5);
	});

	it("puts a group's boxes inside it, under its name, sized among themselves", () => {
		const [, broker] = boxesIn(drawn());
		const [infy, tcs] = boxesIn(broker!.box.querySelector('.boxes')!);

		expect([infy?.label, tcs?.label]).toEqual(['INFY', 'TCS']);
		expect((infy!.width * infy!.height) / (tcs!.width * tcs!.height)).toBeCloseTo(3);
	});

	it('fills the chart with a tile that has nothing inside it', () => {
		const [bank] = boxesIn(drawn(tile('Bank', 600)));
		expect(bank).toMatchObject({ label: 'Bank', left: 0, top: 0, width: 100, height: 100 });
	});

	it('tips the innermost box under the cursor with its share of the whole, until it leaves', async () => {
		const plot = drawn();
		const infy = plot.querySelector('[data-key="INFY"] .name') as Element;

		await fireEvent.pointerOver(infy);
		expect(plot.querySelector('[role="tooltip"]')?.textContent).toMatch(/INFY\s*300\s*30%/);

		await fireEvent.pointerLeave(plot);
		expect(plot.querySelector('[role="tooltip"]')).toBeNull();
	});
});
