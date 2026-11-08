import { anyOf } from '#lib/server/db/expressions.ts';
import { type Database } from '#lib/server/db/index.ts';
import { byCodeUnit } from '#lib/server/shared/text.ts';
import { sql, type SqlBool } from 'kysely';
import { accountType, parentsOf } from '../domain/taxonomy';
import { Feed } from '../domain/types';

/**
 * Puts each row on its ledger's account of that name, whatever its case, made
 * with every account above it the first time it is named. New accounts go in
 * sorted, as symbols do, and each finds its parent by name once all are in.
 */
export const withAccounts = async <R>(
	db: Database,
	ledgerId: string,
	rows: { account: string; row: R }[],
) => {
	const named = [...new Set(rows.flatMap((r) => parentsOf(r.account)))].toSorted(byCodeUnit);
	const names = named.filter((n, i) => named.findIndex((m) => same(m, n)) === i);
	const accounts = names.flatMap((n) => {
		const type = accountType(n);
		return type ? [{ ledgerId, name: n, type }] : [];
	});

	if (accounts.length > 0)
		await db
			.insertInto('accounts')
			.values(accounts)
			.onConflict((c) => c.doNothing())
			.execute();
	await db
		.updateTable('accounts as c')
		.from('accounts as p')
		.set((e) => ({ parentId: e.ref('p.id') }))
		.where('c.ledgerId', '=', ledgerId)
		.where('c.parentId', 'is', null)
		.whereRef('p.ledgerId', '=', 'c.ledgerId')
		.where(sql<SqlBool>`position(':' in c.name) > 0`)
		.where(sql<SqlBool>`lower(p.name) = lower(regexp_replace(c.name, ':[^:]*$', ''))`)
		.execute();
	const known = await db
		.selectFrom('accounts')
		.select(['accounts.id', sql<string>`lower(accounts.name)`.as('key')])
		.where('accounts.ledgerId', '=', ledgerId)
		.where((e) =>
			anyOf(
				sql`lower(${e.ref('accounts.name')})`,
				names.map((n) => n.toLowerCase()),
				'text',
			),
		)
		.execute();

	const ids = Object.fromEntries(known.map((k) => [k.key, k.id]));
	return rows.map((r) => ({ ...r.row, accountId: ids[r.account.toLowerCase()] ?? '' }));
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

type Owner = { feed: Feed; ledgerId: string | null };

/**
 * Puts each row on its owner's symbol of that name, made the first time it is
 * named. New symbols go in sorted, so two syncs making the same ones take their
 * locks in one order, and one another sync made meanwhile is updated in place
 * so that it is still returned.
 */
export const withSymbols = async <R>(
	db: Database,
	owner: Owner,
	rows: { symbol: string; row: R }[],
) => {
	const bySymbol = Object.groupBy(rows, (r) => r.symbol);
	const names = Object.keys(bySymbol).toSorted(byCodeUnit);

	const known = names.length
		? await db
				.selectFrom('symbols')
				.select(['symbols.id', 'symbols.symbol'])
				.where('symbols.feed', '=', owner.feed)
				.where('symbols.ledgerId', owner.ledgerId ? '=' : 'is', owner.ledgerId)
				.where('symbols.symbol', 'in', names)
				.execute()
		: [];
	const seen = new Set(known.map((k) => k.symbol));
	const missing = names.filter((n) => !seen.has(n));
	const made = missing.length
		? await db
				.insertInto('symbols')
				.values(missing.map((n) => ({ ...owner, symbol: n })))
				.onConflict((oc) =>
					oc
						.columns(['feed', 'ledgerId', 'symbol'])
						.doUpdateSet((e) => ({ symbol: e.ref('excluded.symbol') })),
				)
				.returning(['symbols.id', 'symbols.symbol'])
				.execute()
		: [];

	return [...known, ...made].flatMap((s) =>
		(bySymbol[s.symbol] ?? []).map((r) => ({ ...r.row, symbolId: s.id })),
	);
};

/**
 * Puts each link on its feed's symbol, which every ledger shares; one feed at a
 * time, in order.
 */
export const withFeedSymbols = async <R>(
	db: Database,
	rows: { feed: Feed; symbol: string; row: R }[],
) => {
	const byFeed = Object.groupBy(rows, (r) => r.feed);
	const feeds = Object.values(Feed).filter((f) => byFeed[f]);
	const linked = [];
	for (const f of feeds)
		linked.push(...(await withSymbols(db, { feed: f, ledgerId: null }, byFeed[f] ?? [])));
	return linked;
};
