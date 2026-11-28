<script lang="ts" generics="Row extends Record<string, unknown>">
	import { formatsHere } from '#lib/web/shared/format.ts';
	import type { ResolvedPathname } from '$app/types';
	import type { Snippet } from 'svelte';

	const formats = formatsHere();

	type Props = {
		/**
		 * One row per day, in order, as an endpoint returns them, with exact
		 * decimals.
		 */
		rows: Row[];
		/** The field holding each row's ISO day. */
		x: keyof Row & string;
		/** The field holding the amount a day is shaded by. */
		y: keyof Row & string;
		label: string;
		/** Where a day leads, such as its postings; none draws it without a link. */
		href?: (day: string) => ResolvedPathname;
		/**
		 * False draws days of the month from the 1st, under no weekday, for rows
		 * that stand for a day in every month.
		 */
		weekly?: boolean;
		/** False leaves each day unnamed, its name and amount shown on hover. */
		labelled?: boolean;
		/**
		 * True runs each week down a column, as a year of days does, with no
		 * weekday names.
		 */
		across?: boolean;
		/** Drawn above the calendar with the row under the cursor, or none. */
		summary?: Snippet<[number | null]>;
		/** Drawn below the calendar, such as a choice of chart. */
		controls?: Snippet;
	};

	const {
		rows,
		x,
		y,
		label,
		href,
		weekly = true,
		labelled = true,
		across = false,
		summary,
		controls,
	}: Props = $props();

	const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const SHADES = 4;

	const hovered = $state({ index: null as number | null });

	const amounts = $derived(rows.map((r) => Number(r[y] ?? 0)));
	const ranked = $derived(amounts.filter((n) => n > 0).toSorted((a, b) => a - b));

	/**
	 * Days in rows of seven from Monday, blank before the first day and after the
	 * last.
	 */
	const weeks = $derived.by(() => {
		const first = weekly && rows[0] ? weekdayOf(String(rows[0][x])) : 0;
		const cells = [...Array<null>(first).fill(null), ...rows.map((_, i) => i)];
		const blanks = Array<null>((7 - (cells.length % 7)) % 7).fill(null);

		return [...cells, ...blanks].flatMap((_, i, all) => (i % 7 ? [] : [all.slice(i, i + 7)]));
	});

	/**
	 * How dark a day is, by where it ranks among the days with any spending, so
	 * one large day leaves the rest apart.
	 */
	const shadeOf = (amount: number) =>
		amount > 0 ? Math.ceil(((ranked.indexOf(amount) + 1) / ranked.length) * SHADES) : 0;

	const lines = $derived(
		across ? Array.from({ length: 7 }, (_, d) => weeks.map((w) => w[d] ?? null)) : weeks,
	);

	/**
	 * The month a week column starts, named over the column its 1st falls in,
	 * unless the next name is too near for it.
	 */
	const months = $derived.by(() => {
		const names = weeks.map((week) => {
			const first = week.find((i) => i !== null && String(rows[i]?.[x]).endsWith('-01'));
			return first === undefined || first === null ? '' : formats.month(String(rows[first]?.[x]));
		});
		const crowded = names[0] !== '' && names.slice(1, 3).some((n) => n !== '');

		return crowded ? ['', ...names.slice(1)] : names;
	});

	/** The first of a month, and the first day shown, also name their month. */
	const nameOf = (day: string, i: number) =>
		weekly && (i === 0 || day.endsWith('-01'))
			? formats.bucket.day(day)
			: String(Number(day.slice(8)));

	const weekdayOf = (day: string) => (new Date(day).getUTCDay() + 6) % 7;
</script>

<figure>
	{@render summary?.(hovered.index)}
	<table aria-label={label} class={{ across }}>
		{#if across}
			<colgroup>
				<col class="head" />
			</colgroup>
			<thead>
				<tr>
					<th scope="col"></th>
					{#each months as month, m (m)}<th scope="col">{month}</th>{/each}
				</tr>
			</thead>
		{/if}
		{#if weekly && !across}
			<thead>
				<tr>
					{#each WEEKDAYS as weekday (weekday)}<th scope="col">{weekday}</th>{/each}
				</tr>
			</thead>
		{/if}
		<tbody onpointerleave={() => (hovered.index = null)}>
			{#each lines as week, w (w)}
				<tr>
					{#if across}<th scope="row">{w % 2 === 0 && w < 5 ? WEEKDAYS[w] : ''}</th>{/if}
					{#each week as i, k (k)}
						{#if i === null}
							<td></td>
						{:else}
							{@const day = String(rows[i]?.[x])}
							{@const amount = amounts[i] ?? 0}
							<td
								class={{ negative: amount < 0 }}
								data-shade={shadeOf(amount)}
								onpointerenter={() => (hovered.index = i)}
							>
								<a
									href={href?.(day)}
									title={formats.whole(String(rows[i]?.[y] ?? '0'))}
									aria-label="{formats.date(day)}, {formats.whole(String(rows[i]?.[y] ?? '0'))}"
									tabindex={href ? undefined : 0}
									onfocus={() => (hovered.index = i)}
									onblur={() => (hovered.index = null)}
								>
									{#if labelled}
										<span class="day">{nameOf(day, i)}</span>

										<data value={amount}>{amount === 0 ? '' : formats.compact(amount)}</data>
									{/if}
								</a>
							</td>
						{/if}
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
	{#if controls}<figcaption>{@render controls()}</figcaption>{/if}
</figure>

<style>
	figure {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
	}

	figcaption {
		display: flex;
		justify-content: flex-end;
	}

	table {
		width: 100%;
		table-layout: fixed;
		font: var(--text-label);
		border-collapse: separate;
		border-spacing: var(--size-0);
	}

	th {
		color: var(--color-muted);
		font-weight: 400;
		text-align: left;
		text-transform: uppercase;
	}

	td {
		padding: 0;
	}

	a {
		display: flex;
		min-height: var(--size-4);
		padding: var(--size-0);
		flex-direction: column;
		gap: var(--size-0);
		color: inherit;
		text-decoration: none;
	}

	.across .head {
		width: var(--size-4);
	}

	.across th {
		padding: 0;
		text-transform: none;
		white-space: nowrap;
		overflow: visible;
	}

	.across tbody th {
		line-height: 0;
	}

	.across {
		border-spacing: var(--size-line-1);
	}

	.across td[data-shade='0']:has(a) {
		background: var(--color-subtle);
	}

	.across a {
		aspect-ratio: 1;
		min-height: 0;
		padding: 0;
	}

	a:hover {
		text-decoration: underline;
	}

	data {
		font-family: var(--font-mono);
		text-align: right;
	}

	[data-shade='1'] {
		background: var(--color-ink-1);
	}

	[data-shade='2'] {
		background: var(--color-ink-2);
	}

	[data-shade='3'] {
		background: var(--color-ink-3);
	}

	[data-shade='4'] {
		background: var(--color-ink-4);
	}

	.negative data {
		color: var(--color-negative);
	}
</style>
