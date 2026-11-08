import { describe, expect, it } from 'vitest';
import { numberBlocks } from '../../scripts/lcov-blocks.ts';

const file = (...branches: string[]) =>
	[
		'SF:src/a.svelte',
		'DA:15,3',
		...branches.map((b) => `BRDA:${b}`),
		'BRF:2',
		'end_of_record',
		'',
	].join('\n');

describe('numbering the blocks of an lcov file', () => {
	it('gives the same branch the same number whichever order it was counted in', () => {
		const unit = file('19,0,0,5', '19,0,1,0', '22,1,0,5', '22,1,1,0', '15,2,0,3', '15,2,1,0');
		const e2e = file('15,0,0,3', '15,0,1,0', '19,1,0,5', '19,1,1,0', '22,2,0,5', '22,2,1,0');

		const sorted = (lcov: string) => numberBlocks(lcov).split('\n').toSorted();
		expect(sorted(unit)).toEqual(sorted(e2e));
	});

	it('keeps the blocks of one line apart, in the order they were numbered', () => {
		const lcov = file('22,9,0,1', '22,4,0,2', '22,4,1,0');

		expect(numberBlocks(lcov)).toBe(file('22,1,0,1', '22,0,0,2', '22,0,1,0'));
	});

	it('leaves every other line, and every other file, as it was', () => {
		const lcov = `${file('3,7,0,-')}${file('3,8,0,1')}`;

		expect(numberBlocks(lcov)).toBe(`${file('3,0,0,-')}${file('3,0,0,1')}`);
	});
});
