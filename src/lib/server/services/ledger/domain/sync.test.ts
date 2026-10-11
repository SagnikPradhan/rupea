import { describe, expect, it } from 'vitest';
import { indexedVersion, plan } from './sync';

describe('planning a sync', () => {
	it('reindexes files that are new or at another version', () => {
		const stored = [
			{ key: 'a', version: '1' },
			{ key: 'b', version: '2' },
			{ key: 'c', version: '1' },
		];
		const indexed = [
			{ key: 'a', version: '1' },
			{ key: 'b', version: '1' },
		];
		expect(plan(stored, indexed)).toEqual({ changed: ['b', 'c'], gone: [] });
	});

	it('reindexes files that had errors', () => {
		expect(plan([{ key: 'a', version: '1' }], [{ key: 'a', version: null }]).changed).toEqual([
			'a',
		]);
	});

	it('drops files no longer stored', () => {
		expect(plan([], [{ key: 'a', version: '1' }])).toEqual({ changed: [], gone: ['a'] });
	});
});

describe('the version a file is indexed at', () => {
	it('is its own when it parsed cleanly, and none otherwise', () => {
		expect(indexedVersion('v1', [])).toBe('v1');
		expect(indexedVersion('v1', [{ type: 'UnknownError', message: 'x', cause: [] }])).toBeNull();
	});
});
