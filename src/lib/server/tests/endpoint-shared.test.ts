import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { Key, SchemaKey } from '#lib/endpoints/shared.ts';

describe('ledger file keys', () => {
	it.each(['a.rupea', 'bank/2026/hdfc.rupea'])('accepts %j', (key) => {
		expect(v.parse(Key, key)).toBe(key);
	});

	it.each(['', 'notes.txt', 'a.rupea.bak'])('rejects %j', (key) => {
		expect(v.safeParse(Key, key).success).toBe(false);
	});
});

describe('schema keys', () => {
	it('trims what was typed', () => {
		expect(v.parse(SchemaKey, '  hdfc.yml ')).toBe('hdfc.yml');
	});

	it.each(['', '   ', 'hdfc.yaml'])('rejects %j', (key) => {
		expect(v.safeParse(SchemaKey, key).success).toBe(false);
	});
});
