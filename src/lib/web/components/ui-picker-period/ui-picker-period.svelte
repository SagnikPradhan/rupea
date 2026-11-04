<script lang="ts">
	import type { Period } from '#lib/shared/dates.ts';
	import Chip from '#lib/web/components/ui-chip/ui-chip.svelte';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import FilterSection from '#lib/web/components/ui-filter-section/ui-filter-section.svelte';
	import SegmentedControl from '#lib/web/components/ui-segmented-control/ui-segmented-control.svelte';
	import { formatMonth } from '#lib/web/shared/format.ts';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	type Props = {
		current: Period;
		shown: { from: string; to: string };
		today: string;
		first: string | null;
	};

	const { current, shown, today, first }: Props = $props();

	const MANY = 4;
	const PICKED = { at: '', range: '', from: '', to: '' };
	const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

	const kept = $derived([...page.url.searchParams].filter(([key]) => !(key in PICKED)));
	const firstMonth = $derived((first ?? today).slice(0, 7));
	const lastMonth = $derived(today.slice(0, 7));
	const at = $derived('at' in current ? current.at : today.slice(0, 7));

	const hrefOf = (picked: Record<string, string>) =>
		hrefWith(page.url.searchParams, { ...PICKED, ...picked });

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

	const yearHref = (y: string) => hrefOf({ at: current.kind === 'month' ? monthIn(y) : y });
	const yearSegments = $derived(
		years.map((y) => ({ name: y, href: yearHref(y), chosen: at.startsWith(y) })),
	);

	const tabs = $derived({
		month: { name: 'Month', href: hrefOf({ at: lastMonth }) },
		year: { name: 'Year', href: hrefOf({ at: today.slice(0, 4) }) },
		all: { name: 'All', href: hrefOf({ range: 'all' }) },
		custom: { name: 'Custom', href: hrefOf(shown) },
	});
	const segments = $derived(
		Object.entries(tabs).map(([kind, tab]) => ({ ...tab, chosen: kind === current.kind })),
	);
</script>

<FilterSection label="Period">
	<SegmentedControl fill label="Period" {segments} />
</FilterSection>

{#if current.kind === 'month' || current.kind === 'year'}
	<FilterSection label="Year">
		{#if years.length > MANY}
			<select
				aria-label="Year"
				value={at.slice(0, 4)}
				onchange={(e) => goto(yearHref(e.currentTarget.value))}
			>
				{#each years as y (y)}
					<option value={y}>{y}</option>
				{/each}
			</select>
		{:else}
			<SegmentedControl fill label="Year" segments={yearSegments} />
		{/if}
	</FilterSection>
{/if}

{#if current.kind === 'month'}
	<FilterSection label="Month" id="month">
		<nav aria-labelledby="month">
			{#each MONTHS as m (m)}
				{@const month = `${at.slice(0, 4)}-${m}`}
				{#if !isOutside(month)}
					<Chip href={hrefOf({ at: month })} on={month === at}>{formatMonth(`${month}-01`)}</Chip>
				{/if}
			{/each}
		</nav>
	</FilterSection>
{/if}

{#if current.kind === 'custom'}
	<form method="GET">
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
	nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--size-1);
	}

	form {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--size-1);
	}
</style>
