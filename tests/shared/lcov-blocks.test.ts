import { describe, expect, it } from 'vitest';
import { numberBlocks } from '../../scripts/lcov-blocks.ts';

const file = (path: string, ...branches: string[]) =>
	[`SF:${path}`, 'DA:15,3', ...branches.map((b) => `BRDA:${b}`), 'BRF:2', 'end_of_record', ''].join(
		'\n',
	);

describe('numbering the blocks of two lcov files', () => {
	it('gives the same branch the same number whichever order each report counted in', () => {
		const unit = file('a', '19,0,0,5', '19,0,1,0', '22,1,0,5', '22,1,1,0', '15,2,0,3', '15,2,1,0');
		const e2e = file('a', '15,0,0,3', '15,0,1,0', '19,1,0,5', '19,1,1,0', '22,2,0,5', '22,2,1,0');

		const [numbered, other] = numberBlocks(unit, e2e);

		expect(numbered.split('\n').toSorted()).toEqual(other.split('\n').toSorted());
		expect(numbered).toContain('BRDA:15,0,0,3');
	});

	it('keeps the blocks of one line apart, in the order they were numbered', () => {
		const unit = file('a', '22,9,0,1', '22,4,0,2', '22,4,1,0');
		const e2e = file('a', '22,0,0,2', '22,0,1,0', '22,1,0,1');

		expect(numberBlocks(unit, e2e)[0]).toBe(file('a', '22,1,0,1', '22,0,0,2', '22,0,1,0'));
	});

	it('leaves a line alone when the reports see different arms on it', () => {
		const unit = file('a', '22,3,0,1', '22,3,1,0', '22,7,0,2', '30,5,0,1');
		const e2e = file('a', '22,0,0,1', '22,0,1,0', '22,0,2,0', '22,0,3,0', '30,8,0,1');

		const [numbered, other] = numberBlocks(unit, e2e);

		expect(numbered).toBe(file('a', '22,3,0,1', '22,3,1,0', '22,7,0,2', '30,0,0,1'));
		expect(other).toBe(file('a', '22,0,0,1', '22,0,1,0', '22,0,2,0', '22,0,3,0', '30,0,0,1'));
	});

	it('leaves a file alone when the other report does not have it', () => {
		const unit = `${file('a', '3,7,0,-')}${file('b', '3,8,0,1')}`;
		const e2e = file('b', '3,1,0,1');

		const [numbered, other] = numberBlocks(unit, e2e);

		expect(numbered).toBe(`${file('a', '3,7,0,-')}${file('b', '3,0,0,1')}`);
		expect(other).toBe(file('b', '3,0,0,1'));
	});
});
