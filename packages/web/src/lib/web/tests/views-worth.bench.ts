import { it } from 'vitest';
import { worthFrom } from '#lib/endpoints/views.ts';

const DAYS = 1329;
const BANKS = 30;

const tree = [
	{ account: 'Assets', parent: null, posted: false },
	{ account: 'Liabilities', parent: null, posted: false },
	{ account: 'Liabilities:Card', parent: 'Liabilities', posted: true },
	...Array.from({ length: BANKS }, (_, b) => ({
		account: `Assets:Bank${b}`,
		parent: 'Assets',
		posted: true,
	})),
];

const row = (account: string, bucket: string, value: number) => ({
	account,
	commodity: 'INR',
	bucket,
	unpriced: 0,
	value: value.toFixed(2),
});

const rows = Array.from({ length: DAYS }, (_, d) => {
	const bucket = Temporal.PlainDate.from('2023-03-31').add({ days: d }).toString();
	const banks = Array.from({ length: BANKS }, (_, b) =>
		row(`Assets:Bank${b}`, bucket, 1000 + b * d),
	);

	return [
		...banks,
		row('Assets', bucket, 1000 * BANKS),
		row('Liabilities:Card', bucket, -200),
		row('Liabilities', bucket, -200),
	];
}).flat();

const deltas = { from: '2023-03-31', to: '2026-11-18', base: 'INR', rows };

it(
	`shapes worth over ${DAYS} days of ${BANKS} accounts`,
	{ timeout: 600_000 },
	async ({ bench }) => {
		const worth = worthFrom(deltas, { tree, account: null, base: 'INR' });

		await bench.compare(
			bench('worthFrom', () => worthFrom(deltas, { tree, account: null, base: 'INR' })),
			bench('stringify', () => JSON.stringify(worth)),
		);
	},
);
