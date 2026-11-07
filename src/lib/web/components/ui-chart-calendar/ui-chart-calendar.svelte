<script lang="ts" generics="Row extends Record<string, unknown>">
	import { formatAmount, formatBucket, formatCompact } from '#lib/web/shared/format.ts';
	import type { Snippet } from 'svelte';

	type Props = {
		/** One row per day, in order, as an endpoint returns them, with exact decimals. */
		rows: Row[];
		/** The field holding each row's ISO day. */
		x: keyof Row & string;
		/** The field holding the amount a day is shaded by. */
		y: keyof Row & string;
		label: string;
		/** Where a day leads, such as its postings; none draws it without a link. */
		href?: (day: string) => string;
		/** False draws days of the month from the 1st, under no weekday, for rows that stand for a day in every month. */
		weekly?: boolean;
		/** Draws each day as a rounded square whose area is its amount, on a tile, instead of shading its cell. */
		squircles?: boolean;
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
		squircles = false,
		summary,
		controls,
	}: Props = $props();

	const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const SHADES = 4;

	const hovered = $state({ index: null as number | null });

	const amounts = $derived(rows.map((r) => Number(r[y] ?? 0)));
	const most = $derived(Math.max(0, ...amounts));

	/** Days in rows of seven from Monday, blank before the first day and after the last. */
	const weeks = $derived.by(() => {
		const first = weekly && rows[0] ? weekdayOf(String(rows[0][x])) : 0;
		const cells = [...Array<null>(first).fill(null), ...rows.map((_, i) => i)];
		const blanks = Array<null>((7 - (cells.length % 7)) % 7).fill(null);

		return [...cells, ...blanks].flatMap((_, i, all) => (i % 7 ? [] : [all.slice(i, i + 7)]));
	});

	/** How dark a day is, from none for nothing spent to the darkest for the month's largest day. */
	const shadeOf = (amount: number) => (amount > 0 ? Math.ceil((amount / most) * SHADES) : 0);

	/** The first of a month, and the first day shown, also name their month. */
	const nameOf = (day: string, i: number) =>
		weekly && (i === 0 || day.endsWith('-01'))
			? formatBucket.day(day)
			: String(Number(day.slice(8)));

	const weekdayOf = (day: string) => (new Date(day).getUTCDay() + 6) % 7;
</script>

<figure>
	{@render summary?.(hovered.index)}
	<table aria-label={label} class={{ squircles }}>
		{#if weekly}
			<thead>
				<tr>
					{#each WEEKDAYS as weekday (weekday)}<th scope="col">{weekday}</th>{/each}
				</tr>
			</thead>
		{/if}
		<tbody onpointerleave={() => (hovered.index = null)}>
			{#each weeks as week, w (w)}
				<tr>
					{#each week as i, k (k)}
						{#if i === null}
							<td></td>
						{:else}
							{@const day = String(rows[i]?.[x])}
							{@const amount = amounts[i] ?? 0}
							<td
								class={{ negative: amount < 0 }}
								data-shade={squircles ? 0 : shadeOf(amount)}
								onpointerenter={() => (hovered.index = i)}
							>
								<a
									href={href?.(day)}
									title={formatAmount(String(rows[i]?.[y] ?? '0'))}
									onfocus={() => (hovered.index = i)}
									onblur={() => (hovered.index = null)}
								>
									{#if squircles}
										<span
											class="squircle"
											style:--share={Math.sqrt(Math.max(amount, 0) / (most || 1))}
										></span>
									{/if}
									<span class="day">{nameOf(day, i)}</span>

									<data value={amount}>{amount === 0 ? '' : formatCompact(amount)}</data>
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
		border-collapse: separate;
		border-spacing: var(--size-0);
		font: var(--text-label);
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
		flex-direction: column;
		gap: var(--size-0);
		padding: var(--size-0);
		min-height: var(--size-4);
		color: inherit;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	.squircles td {
		border: var(--size-line-0) solid var(--color-subtle);
		border-radius: var(--radius-1);
	}

	.squircles a {
		position: relative;
		justify-content: space-between;
		aspect-ratio: 1;
		padding: var(--size-1);
	}

	.squircle {
		position: absolute;
		inset: 0;
		width: calc(var(--share) * 50%);
		aspect-ratio: 1;
		margin: auto;
		border-radius: 35%;
		corner-shape: squircle;
		background: var(--color-ink-3);
	}

	data {
		font-family: var(--font-mono);
		text-align: right;
	}

	.squircles .day,
	.squircles data {
		position: relative;
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
