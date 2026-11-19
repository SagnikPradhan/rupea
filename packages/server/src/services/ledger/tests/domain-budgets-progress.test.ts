import { defaultConfiguration } from '#lib/server/shared/context/config.ts';
import { parseAmount } from '#services/ledger/domain/amounts.ts';
import { budgetsIn } from '#services/ledger/domain/budgets.ts';
import { describe, expect, it, vi } from 'vitest';

vi.mock(import('#lib/server/shared/periods.ts'), () => ({
	periodOf: (day: Temporal.PlainDate) => ({ from: day, to: day.subtract({ days: 1 }) }),
}));

describe('walking the periods of a range', () => {
	it('moves on a day at least when a period does not reach past its day', () => {
		const lines = [
			{ account: 'Expenses:Food', since: null, keys: { limit: ['1'] }, file: 'a', line: 1 },
		];
		const range = {
			from: Temporal.PlainDate.from('2026-01-01'),
			to: Temporal.PlainDate.from('2026-02-01'),
		};
		const dateFormats = defaultConfiguration.ledger.dateFormats;

		expect(budgetsIn(lines, { ...range, dateFormats })).toMatchObject([
			{ limit: parseAmount('32') },
		]);
	});
});
