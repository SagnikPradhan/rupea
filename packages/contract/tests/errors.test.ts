import { batchOf, CODE, errors, STATUS } from '@rupea/contract/errors.ts';
import { RupeaError } from '@rupea/shared/errors.ts';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

describe('the status of an error', () => {
	it('is set for every type the error schema knows, and for no other', () => {
		const known = Object.keys(STATUS).filter(
			(type) => !v.safeParse(RupeaError, { type }).issues?.some((i) => i.type === 'variant'),
		);

		expect(known).toEqual(Object.keys(STATUS));
		expect(v.safeParse(RupeaError, { type: 'Bogus' }).issues?.[0]?.type).toBe('variant');
	});

	it('has a code that declares the same status', () => {
		const declared = Object.values(CODE).map((code) => [code, errors[code].status]);

		expect(declared).toEqual(Object.entries(CODE).map(([status, code]) => [code, Number(status)]));
		expect(Object.keys(errors)).toEqual(Object.values(CODE));
	});
});

describe('a batch', () => {
	it('holds what succeeded and the errors of the rest', () => {
		const Days = batchOf(v.string());

		expect(v.is(Days, { succeeded: ['a'], failed: [{ type: 'AuthInvalidCode' }] })).toBe(true);
		expect(v.is(Days, { succeeded: [1], failed: [] })).toBe(false);
		expect(v.is(Days, { succeeded: [], failed: [{ type: 'Bogus' }] })).toBe(false);
	});
});
