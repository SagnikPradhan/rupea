import { describe, expect, it } from 'vitest';
import { OTHER, OTHER_OWED } from '#lib/web/shared/chart.ts';
import { areasOf, withAreas } from '#lib/web/shared/worth.ts';

/** A day's parts, each an account or, after a space, one commodity it holds. */
const day = (parts: Record<string, string>) => ({
	day: '2026-01-01',
	parts: Object.entries(parts).map(([key, amount]) => {
		const [account = key, commodity = null] = key.split(' ');
		return { account, commodity, amount };
	}),
});

describe('the areas', () => {
	it('give the largest held then the largest owed a shade, by the last day, folding the rest of each side', () => {
		const worth = [
			day({ 'Assets:Old': '900', 'Liabilities:Card': '-5' }),
			day({
				'Assets:A': '600',
				'Assets:B': '500',
				'Assets:C': '400',
				'Assets:D': '300',
				'Assets:E': '200',
				'Assets:Old': '0',
				'Liabilities:Card': '-50',
				'Liabilities:Loan': '-80',
				'Liabilities:Shop': '-10',
				'Liabilities:Gym': '-5',
			}),
		];

		expect(areasOf(worth).map((a) => [a.label, a.parts.length, a.shade])).toEqual([
			['A', 1, '--color-series-1'],
			['B', 1, '--color-series-2'],
			['C', 1, '--color-series-3'],
			['D', 1, '--color-series-4'],
			[OTHER, 2, '--color-series-5'],
			['Loan', 1, '--color-owed-1'],
			['Card', 1, '--color-owed-2'],
			[OTHER_OWED, 2, '--color-owed-3'],
		]);
	});

	it('keep every part when each side fits, and add up a folded area each day', () => {
		const worth = [
			day({ 'Assets:Broker INFY': '30', 'Assets:Broker TCS': '20' }),
			day({ 'Assets:Broker INFY': '40' }),
		];
		const areas = areasOf(worth);

		expect(areas.map((a) => [a.key, a.label])).toEqual([
			['Assets:Broker INFY', 'INFY'],
			['Assets:Broker TCS', 'TCS'],
		]);
		const folded = { ...areas[0]!, parts: areas.flatMap((a) => a.parts) };
		expect(withAreas(worth, [folded]).map((r) => r['Assets:Broker INFY'])).toEqual(['50', '40']);
	});
});
