import { bearerOf, multipart } from '@rupea/server/tests/shared/api.ts';
import { createLedger, createUser } from '@rupea/server/tests/shared/seed.ts';
import { it } from '@rupea/server/tests/shared/vitest.ts';
import { describe, expect } from 'vitest';
import { provide } from '#lib/server/shared/context/context.ts';
import * as Files from '#services/ledger/application/files.ts';
import { createApi } from '../api/api.ts';

const content = [
	'2026-01-02 Buy',
	'\tAssets:Zerodha 10 INFY @ 1500',
	'\tAssets:Bank',
	'',
	'2026-03-01 Sell',
	'\tAssets:Zerodha -4 INFY {1500} @ 1700',
	'\tAssets:Bank 6800',
	'\tIncome:Gains -800',
	'',
	'2026-03-05 Dinner',
	'\tExpenses:Food 2000.5',
	'\tAssets:Bank',
	'',
	'P 2026-10-01 INFY 1800',
	'',
].join('\n');

const statements = new FormData();
statements.append('files[0]', new File(['x'], 'a.csv'));

const upload = await multipart(statements);

const schema = { key: 'a.yml', content: 'version: v1' };

const draft = {
	file: 'a.rupea',
	date: '2026-10-02',
	time: '',
	description: 'Tea',
	comment: '',
	metadata: [],
	postings: [],
};

const old = [
	'1900-01-01 Buy',
	'\tAssets:Zerodha 10 INFY @ 1500',
	'\tAssets:Bank',
	'',
	'1900-01-02 Dinner',
	'\tExpenses:Food 10',
	'\tAssets:Bank',
	'',
].join('\n');

const span = (from: string, to: string) => ({
	invested: `invested?from=${from}&to=${to}`,
	bridge: `bridge?from=${from}&to=${to}`,
	drops: `drops?from=${from}&to=${to}`,
	returns: `returns?from=${from}&to=${to}`,
	deltas: `deltas?spans[0][from]=${from}&spans[0][to]=${to}&bucket=month`,
	'daily-deltas': `daily-deltas?from=${from}&to=${to}`,
});

const spanned = Object.keys(span('', ''));

const inject = async (context: Parameters<typeof createApi>[0], text: string, url: string) => {
	const ledger = await createLedger(context.db);
	await Files.createFile({ ledger, key: 'a.rupea', content: text });
	const api = await createApi(context);

	return api.inject({
		url: `/api/ledgers/${ledger.handle}/${url}`,
		headers: await bearerOf(ledger.owner),
	});
};

describe('the accounts api', () => {
	it.for([
		[
			'accounts?day=2026-10-02',
			{
				succeeded: [
					{ account: 'Assets', total: '599.50', cost: '9000.00', gain: '1800.00' },
					{ account: 'Assets:Bank', parent: 'Assets', total: '-10200.50' },
					{
						account: 'Assets:Zerodha',
						holdings: [
							{
								commodity: 'INFY',
								hasLots: true,
								units: '6.00',
								price: { amount: '1800.00', commodity: 'INR' },
								value: '10800.00',
								paid: '9000.00',
								gain: '1800.00',
							},
						],
					},
				],
			},
		],
		[
			'invested?from=2026-10-01&to=2026-10-01',
			{ succeeded: [{ day: '2026-10-01', value: '10800.00', cost: '9000.00' }] },
		],
		[
			'bridge?from=2026-01-01&to=2026-10-01',
			{
				succeeded: [
					{
						from: '2026-01-02',
						to: '2026-10-01',
						income: '800.00',
						expenses: '2000.50',
						shifts: [{ account: 'Assets:Zerodha', amount: '2600.00' }],
						end: '599.50',
					},
				],
			},
		],
		[
			'drops?from=2026-01-01&to=2026-10-01',
			{ succeeded: [{ underwater: expect.arrayContaining([{ day: '2026-10-01', depth: 0 }]) }] },
		],
		[
			'returns?from=2026-01-01&to=2026-10-01',
			{
				succeeded: expect.arrayContaining([
					{ account: 'Assets:Zerodha', netIn: '8200.00', xirr: expect.any(Number), yearly: false },
				]),
				failed: [{ type: 'ReturnUnsolved', account: 'Assets' }],
			},
		],
		[
			'deltas?spans[0][from]=2026-03-01&spans[0][to]=2026-03-31&bucket=month',
			{
				succeeded: [
					{
						from: '2026-03-01',
						bucket: 'month',
						buckets: ['2026-03-01'],
						totals: [
							{ account: 'Expenses', parent: null, amount: '2000.50', inflow: '2000.50' },
							{ account: 'Expenses:Food', parent: 'Expenses' },
						],
					},
				],
			},
		],
		[
			'daily-deltas?from=2026-03-01&to=2026-03-31',
			{ succeeded: expect.arrayContaining([{ day: 5, amount: '2000.50', unpriced: 0 }]) },
		],
		[
			'lots?account=Assets:Zerodha&commodity=INFY',
			{
				succeeded: [
					{
						location: { file: 'a.rupea', line: 1 },
						origin: 'buy',
						units: '10.00',
						remaining: '6.00',
						cost: { amount: '1500.00', commodity: 'INR' },
						disposals: [
							{
								kind: 'sale',
								units: '-4.00',
								price: { amount: '1700.00', commodity: 'INR' },
								gain: { amount: '800.00', commodity: 'INR' },
							},
						],
					},
				],
			},
		],
		[
			'account-tree',
			[
				{ account: 'Assets', parent: null },
				{ account: 'Assets:Bank', parent: 'Assets' },
				{ account: 'Assets:Zerodha', parent: 'Assets' },
				{ account: 'Expenses', parent: null },
				{ account: 'Expenses:Food', parent: 'Expenses' },
				{ account: 'Income', parent: null },
				{ account: 'Income:Gains', parent: 'Income' },
			],
		],
		['account-names?prefix=Assets:Z', ['Assets:Zerodha']],
	] as const)('answers %s', async ([url, expected], { context }) =>
		provide(context, async () => {
			const reply = await inject(context, content, url);

			expect(reply.statusCode).toBe(200);
			expect(reply.json()).toMatchObject(expected);
		}),
	);

	it('answers a span that runs backwards with a 422 on every route that walks days', ({
		context,
	}) =>
		provide(context, async () => {
			const replies = await Promise.all(
				Object.values(span('2026-10-02', '2026-10-01')).map((url) => inject(context, content, url)),
			);

			expect(replies.map((r) => r.statusCode)).toEqual(spanned.map(() => 422));
			expect(replies.map((r) => r.json().data.type)).toEqual(spanned.map(() => 'SpanReversed'));
		}));

	it('answers a span over a hundred years with a 422 on every route that walks days', ({
		context,
	}) =>
		provide(context, async () => {
			const replies = await Promise.all(
				Object.values(span('1900-01-01', '2026-10-01')).map((url) => inject(context, old, url)),
			);

			expect(replies.map((r) => r.statusCode)).toEqual(spanned.map(() => 422));
			expect(replies.map((r) => r.json().data.type)).toEqual(spanned.map(() => 'SpanTooLong'));
		}));

	it('answers all of history from the first day with data', ({ context }) =>
		provide(context, async () => {
			const replies = await Promise.all(
				Object.values(span('0001-01-01', '2026-10-01')).map((url) => inject(context, content, url)),
			);

			expect(replies.map((r) => r.statusCode)).toEqual(spanned.map(() => 200));
			expect(replies.map((r) => r.json().succeeded.length > 0)).toEqual(spanned.map(() => true));
		}));

	it('asks for at most two spans of deltas', ({ context }) =>
		provide(context, async () => {
			const spans = [0, 1, 2].map((i) => `spans[${i}][from]=2026-03-01&spans[${i}][to]=2026-03-31`);

			const reply = await inject(context, content, `deltas?${spans.join('&')}&bucket=day`);

			expect(reply.statusCode).toBe(400);
		}));

	it.for<['GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE', string, object?, Record<string, string>?]>([
		['GET', 'accounts?day=2026-10-02'],
		['GET', 'worth?from=2026-10-01&to=2026-10-02'],
		['GET', 'invested?from=2026-10-01&to=2026-10-02'],
		['GET', 'bridge?from=2026-10-01&to=2026-10-02'],
		['GET', 'drops?from=2026-10-01&to=2026-10-02'],
		['GET', 'returns?from=2026-10-01&to=2026-10-02'],
		['GET', 'deltas?spans[0][from]=2026-10-01&spans[0][to]=2026-10-02&bucket=day'],
		['GET', 'daily-deltas?from=2026-10-01&to=2026-10-02'],
		['GET', 'lots?account=Assets:Zerodha&commodity=INFY'],
		['GET', 'account-tree'],
		['GET', 'account-names?prefix=Assets'],
		['GET', 'terms?day=2026-10-02'],
		['PUT', 'terms', { account: 'Liabilities:Car', entries: [['kind', 'loan']] }],
		['GET', 'transactions?from=2026-10-01&to=2026-10-02'],
		['GET', 'postings?from=2026-10-01&to=2026-10-02'],
		['GET', 'first-day'],
		['GET', 'problems'],
		['GET', 'sync'],
		['POST', 'sync'],
		['GET', 'files'],
		['GET', 'files/content?key=a.rupea'],
		['GET', 'latest-file?account=Assets:Bank'],
		['GET', 'transaction-files'],
		['GET', 'transactions/0194f5e0-0000-7000-8000-000000000000'],
		['POST', 'transactions', { form: draft }],
		['PUT', 'transactions', { file: 'a.rupea', line: 1, version: 'v', form: draft }],
		['DELETE', 'transactions', { file: 'a.rupea', line: 1, version: 'v' }],
		['POST', 'files', { key: 'a.rupea', content: '' }],
		['PUT', 'files', { key: 'a.rupea', content: '', version: 'v' }],
		['PATCH', 'files', { moves: [{ from: 'a.rupea', to: 'b.rupea' }] }],
		['DELETE', 'files', { keys: ['a.rupea'] }],
		['POST', 'files/format', { content: '' }],
		['POST', 'files/parse', { key: 'a.rupea', content: '' }],
		['POST', 'files/additions', { from: 'a.rupea', to: 'b.rupea' }],
		['POST', 'statements', upload.payload, upload.headers],
		['GET', 'statements'],
		['GET', 'imports'],
		['GET', 'statements/content?statement=20260101/a.csv'],
		['DELETE', 'statements', { keys: ['20260101/a.csv'] }],
		['POST', 'statements/unlock', { statement: '20260101/a.csv', password: 'x' }],
		['GET', 'statements/schema?statement=20260101/a.csv'],
		['POST', 'statements/preview', { statement: '20260101/a.csv', schema }],
		['POST', 'statements/import', { statement: '20260101/a.csv', schema }],
		['GET', 'schemas'],
		['GET', 'schemas/a.yml'],
		['PUT', 'schemas/a.yml', { content: 'version: v1' }],
		['DELETE', 'schemas/a.yml'],
		['GET', 'suggestions?file=a.rupea'],
		[
			'POST',
			'links',
			{
				edits: [
					{
						file: 'a.rupea',
						line: 1,
						date: '2026-10-02',
						description: 'x',
						role: 'primary',
						group: 'g',
					},
				],
			},
		],
		['PUT', 'dismissals/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
		['GET', 'groups?file=a.rupea'],
		['PATCH', 'groups/g', { to: 'h' }],
		['PUT', 'groups/g/primary', { file: 'a.rupea', line: 1 }],
	])(
		'answers a ledger of another user with a 404 on %s %s',
		async ([method, url, payload, extra], { context, db }) =>
			provide(context, async () => {
				const ledger = await createLedger(db);
				const stranger = await createUser(db);
				const api = await createApi(context);

				const reply = await api.inject({
					method,
					url: `/api/ledgers/${ledger.handle}/${url}`,
					headers: { ...(await bearerOf(stranger.userId)), ...extra },
					...(payload && { payload }),
				});

				expect(reply.statusCode).toBe(404);
				expect(reply.json()).toMatchObject({ data: { type: 'LedgerNotFound' } });
			}),
	);

	it('saves the terms of an account and lists them back', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const headers = await bearerOf(ledger.owner);
			const api = await createApi(context);
			const url = `/api/ledgers/${ledger.handle}/terms`;
			const entries = [
				['kind', 'loan'],
				['rate', '9.5%'],
				['tenure', '60'],
			];

			const saved = await api.inject({
				method: 'PUT',
				url,
				headers,
				payload: { account: 'Liabilities:Car', entries },
			});
			const listed = await api.inject({ url: `${url}?day=2026-10-02`, headers });

			expect(saved.statusCode).toBe(200);
			expect(saved.json()).toEqual({ file: 'main.rupea' });
			expect(listed.json()).toEqual([
				{
					account: 'Liabilities:Car',
					current: { kind: 'loan', rate: '9.5%', tenure: '60' },
					held: { kind: 'loan', rate: 9.5, tenure: 60, method: 'reducing' },
				},
			]);
		}));

	it('leaves the file as it was when the same terms are saved again', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const headers = await bearerOf(ledger.owner);
			const api = await createApi(context);
			const url = `/api/ledgers/${ledger.handle}/terms`;
			const payload = { account: 'Liabilities:Car', entries: [['kind', 'loan']] };
			const textOf = async (key: string) =>
				(await Files.readFile({ ledger, key }))._unsafeUnwrap().content;

			const first = await api.inject({ method: 'PUT', url, headers, payload });
			const once = await textOf('main.rupea');
			const second = await api.inject({ method: 'PUT', url, headers, payload });

			expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
			expect(await textOf('main.rupea')).toBe(once);
		}));

	it('refuses terms that do not read by their kind with a 400', ({ context, db }) =>
		provide(context, async () => {
			const ledger = await createLedger(db);
			const api = await createApi(context);

			const reply = await api.inject({
				method: 'PUT',
				url: `/api/ledgers/${ledger.handle}/terms`,
				headers: await bearerOf(ledger.owner),
				payload: { account: 'Liabilities:Car', entries: [['kind', 'gift']] },
			});

			expect(reply.statusCode).toBe(400);
		}));
});
