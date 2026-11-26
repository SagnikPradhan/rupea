<script lang="ts">
	import { ICONS } from '#lib/web/shared/icons.ts';
	import { ZERO, printAmount } from '@rupea/shared/money.ts';
	import type { Grain, Period } from '@rupea/shared/dates.ts';
	import { paramsOf } from '#lib/web/shared/filter.ts';
	import { depthOf, nameOf } from '#lib/web/shared/accounts.ts';
	import { seriesOf, tintOf } from '#lib/web/shared/chart.ts';
	import Amount from '#lib/web/components/app-ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/app-ledger-table/app-ledger-table.svelte';
	import Swatch from '#lib/web/components/ui-swatch/ui-swatch.svelte';
	import Tag from '#lib/web/components/ui-tag/ui-tag.svelte';
	import { formatShare } from '#lib/web/shared/format.ts';
	import { postingsHref } from '#lib/web/shared/links.ts';
	import * as Spending from '#lib/web/shared/spending.ts';
	import { SvelteSet } from 'svelte/reactivity';

	type Props = {
		label: string;
		spending: Spending.Spent | undefined;
		account: string;
		parts: string[];
		colours: Record<string, number>;
		bucket: Grain;
		first: Temporal.PlainDate;
		last: Temporal.PlainDate;
		handle: string;
		period: Period;
	};

	const { label, spending, account, parts, colours, bucket, first, last, handle, period }: Props =
		$props();

	const rows = $derived(Spending.rowsOf(spending, account));
	const ordered = $derived(Spending.largestFirst(rows, account));
	const opened = new SvelteSet<string>();
	const shown = $derived(Spending.shownOf(ordered, account, [...opened]));
	const total = $derived(Spending.totalOf(spending, account) ?? ZERO);
	const days = $derived(Spending.daysIn(first, last));

	const parents = $derived(Object.fromEntries(rows.map((r) => [r.account, r.parent])));
	const partOf = (a: string, depth = 0): { part: string; depth: number } | null => {
		if (parts.includes(a)) return { part: a, depth };
		const parent = parents[a];
		return parent ? partOf(parent, depth + 1) : null;
	};
	const postingsOf = (a: string) => postingsHref(handle, { account: a, ...paramsOf(period) });
	const fold = (a: string) => (opened.has(a) ? opened.delete(a) : opened.add(a));
</script>

{#if rows.length > 0}
	<LedgerTable
		columns={[
			{ label: 'Account' },
			{ label, kind: 'amount' },
			{ label: 'Share', kind: 'amount', optional: true },
			...(bucket === 'day'
				? []
				: [{ label: 'Per month', kind: 'amount' as const, optional: true }]),
		]}
	>
		<tbody>
			{#each shown as row (row.account)}
				{@const depth = depthOf(row.account) - depthOf(account)}
				{@const folds = row.account !== account && rows.some((r) => r.parent === row.account)}
				{@const Chevron = opened.has(row.account) ? ICONS.expanded : ICONS.collapsed}
				<tr>
					<th scope="row">
						{#if folds}<button
								class="fold"
								aria-label="Accounts under {nameOf(row.account)}"
								aria-expanded={opened.has(row.account)}
								onclick={() => fold(row.account)}
							>
								<Chevron size={16} />
							</button>{/if}<a href={postingsOf(row.account)} title={row.account}>
							<span class="name" style:--depth={folds ? depth - 1 : depth}>
								{nameOf(row.account)}
							</span>
						</a>
						{#if partOf(row.account)}
							{@const under = partOf(row.account)}
							<Swatch
								shade={seriesOf(colours[under?.part ?? ''] ?? 0)}
								tint={tintOf(under?.depth ?? 0)}
							/>
						{/if}
						{#if row.unpriced > 0}<Tag>{row.unpriced} unpriced</Tag>{/if}
					</th>
					<Amount value={printAmount(row.amount)} />
					<td class="amount share optional">
						{#if row.account !== account}{formatShare(
								printAmount(row.amount),
								printAmount(total),
							)}{/if}
					</td>
					{#if bucket !== 'day'}
						<Amount value={printAmount(Spending.monthlyAverageOver(row.amount, days))} optional />
					{/if}
				</tr>
			{/each}
		</tbody>
	</LedgerTable>
{:else}
	<p>Nothing {label.toLowerCase()} in this period.</p>
{/if}

<style>
	.name {
		display: inline-block;
		padding-left: calc(var(--depth) * var(--size-2));
	}

	.share {
		color: var(--color-muted);
	}

	.fold {
		display: inline-flex;
		width: var(--size-2);
		padding: 0;
		border: none;
		background: none;
		color: var(--color-muted);
		vertical-align: middle;
	}

	a {
		color: inherit;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
