<script lang="ts">
	import type { Period } from '#lib/shared/dates.ts';
	import Button from '#lib/web/components/button/button.svelte';
	import { formatMonth } from '#lib/web/shared/format.ts';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { page } from '$app/state';

	type Props = {
		/** The period shown. */
		current: Period;
		/** The first and last day shown, which a custom period starts from. */
		shown: { from: string; to: string };
		/** The viewer's ISO day, past which nothing can be picked. */
		today: string;
		/** The ledger's first day, before which nothing can be picked, or none while it is empty. */
		first: string | null;
	};

	const { current, shown, today, first }: Props = $props();

	const PICKED = { at: '', range: '', from: '', to: '' };
	const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

	const kept = $derived([...page.url.searchParams].filter(([key]) => !(key in PICKED)));
	const firstMonth = $derived((first ?? today).slice(0, 7));
	const lastMonth = $derived(today.slice(0, 7));
	const at = $derived('at' in current ? current.at : today.slice(0, 7));

	/** A period replaces the one picked, keeping the rest of the query. */
	const hrefOf = (picked: Record<string, string>) =>
		hrefWith(page.url.searchParams, { ...PICKED, ...picked });

	/** The same month in another year, or the nearest one the ledger has. */
	const monthIn = (year: string) => {
		const month = `${year}-${at.slice(5, 7)}`;
		if (month < firstMonth) return firstMonth;
		if (month > lastMonth) return lastMonth;
		return month;
	};

	const isOutside = (month: string) => month < firstMonth || month > lastMonth;

	const years = $derived(
		Array.from({ length: Number(today.slice(0, 4)) - Number(firstMonth.slice(0, 4)) + 1 }, (_, i) =>
			String(Number(firstMonth.slice(0, 4)) + i),
		),
	);

	const tabs = $derived({
		month: { name: 'Month', href: hrefOf({ at: lastMonth }) },
		year: { name: 'Year', href: hrefOf({ at: today.slice(0, 4) }) },
		all: { name: 'All', href: hrefOf({ range: 'all' }) },
		custom: { name: 'Custom', href: hrefOf(shown) },
	});
</script>

<div class="picker">
	<span id="period">Period</span>
	<nav aria-labelledby="period">
		{#each Object.entries(tabs) as [kind, tab] (kind)}
			<a href={tab.href} aria-current={kind === current.kind ? 'page' : undefined}>{tab.name}</a>
		{/each}
	</nav>
</div>

{#if current.kind === 'month' || current.kind === 'year'}
	<div class="picker">
		<span id="year">Year</span>
		<nav aria-labelledby="year">
			{#each years as y (y)}
				<a
					href={hrefOf({ at: current.kind === 'month' ? monthIn(y) : y })}
					aria-current={at.startsWith(y) ? 'page' : undefined}>{y}</a
				>
			{/each}
		</nav>
	</div>
{/if}

{#if current.kind === 'month'}
	<div class="picker">
		<span id="month">Month</span>
		<nav aria-labelledby="month">
			{#each MONTHS as m (m)}
				{@const month = `${at.slice(0, 4)}-${m}`}
				{#if isOutside(month)}
					<span aria-disabled="true">{formatMonth(`${month}-01`)}</span>
				{:else}
					<a href={hrefOf({ at: month })} aria-current={month === at ? 'page' : undefined}
						>{formatMonth(`${month}-01`)}</a
					>
				{/if}
			{/each}
		</nav>
	</div>
{/if}

{#if current.kind === 'custom'}
	<form method="GET" class="picker">
		{#each kept as [key, value] (key)}
			<input type="hidden" name={key} {value} />
		{/each}
		<input
			type="date"
			name="from"
			value={current.from}
			min={first}
			max={today}
			required
			aria-label="From"
		/>
		<input
			type="date"
			name="to"
			value={current.to}
			min={first}
			max={today}
			required
			aria-label="To"
		/>
		<Button>Apply</Button>
	</form>
{/if}

<style>
	nav span {
		color: var(--color-muted);
	}

	form {
		align-items: start;
	}
</style>
