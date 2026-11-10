import { defaultConfiguration, readConfiguration } from '#lib/server/shared/context/config.ts';
import { describe, expect, it } from 'vitest';

describe('the configuration', () => {
	it('falls back to its defaults for variables left unset or empty', () => {
		expect(readConfiguration({ RUPEA_STORAGE_FILES: '' })).toEqual(defaultConfiguration);
	});

	it('reads each variable into the field it names', () => {
		const env = {
			RUPEA_MODELS_THREADS: '3',
			RUPEA_JOBS_WORKERS: '0',
			RUPEA_LEDGER_DATE_FORMATS: 'yyyy-MM-dd | d MMM yyyy',
			RUPEA_ACCOUNTS_SIGNUP: 'open',
		};

		expect(readConfiguration(env)).toMatchObject({
			models: { threads: 3 },
			jobs: { workers: 0 },
			ledger: { dateFormats: ['yyyy-MM-dd', 'd MMM yyyy'] },
			accounts: { signup: 'open' },
		});
	});

	it('names every field it refuses', () => {
		const env = { RUPEA_MODELS_THREADS: 'many', RUPEA_LEDGER_DATE_FORMATS: 'MM/yyyy' };

		expect(() => readConfiguration(env)).toThrow(/models\.threads[\s\S]*ledger\.dateFormats/);
	});
});
