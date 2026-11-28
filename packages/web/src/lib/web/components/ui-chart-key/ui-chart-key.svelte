<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Swatch from '#lib/web/components/ui-swatch/ui-swatch.svelte';

	type Entry = {
		label: string;
		/** What the name stands for right now, left out for an entry that has none. */
		amount?: string;
		/** The chart colour of a part, drawn as a swatch. */
		shade?: string;
		/** The line an entry stands for, drawn in place of a swatch. */
		mark?: 'primary' | 'context' | 'band' | 'negative' | 'reference';
		/** The place of a part in its chart, which hovering the entry focuses. */
		part?: number;
		/** Where the entry leads when clicked, such as the account it names. */
		href?: ResolvedPathname;
	};

	type Props = {
		entries: Entry[];
		/**
		 * The part the pointer is on, in the key or in the chart; the other parts
		 * fade.
		 */
		focus?: number | null;
		onfocus?: (part: number | null) => void;
	};

	const { entries, focus = null, onfocus }: Props = $props();

	const longest = $derived(Math.max(...entries.map((e) => e.label.length)));
</script>

<ul style:--name="{longest}ch">
	{#each entries as entry, i (i)}
		{@const part = entry.part}
		<li
			class={[entry.mark, { faded: focus !== null && part !== undefined && focus !== part }]}
			onpointerenter={() => part !== undefined && onfocus?.(part)}
			onpointerleave={() => part !== undefined && onfocus?.(null)}
		>
			{#if entry.shade}<Swatch shade={entry.shade} />{/if}
			{#if entry.href}
				<a href={entry.href} title={entry.label}>{entry.label}</a>
			{:else}
				<span title={entry.label}>{entry.label}</span>
			{/if}
			{#if entry.amount !== undefined}<data>{entry.amount}</data>{/if}
		</li>
	{/each}
</ul>

<style>
	ul {
		display: grid;
		width: 100%;
		grid-template-columns: repeat(
			auto-fill,
			min(
				100%,
				calc(var(--size-2) + var(--size-0) + var(--name) + var(--size-1) + var(--size-0) + 7ch)
			)
		);
		gap: var(--size-1) var(--size-0);
		font: var(--text-label);
		list-style: none;
	}

	li {
		display: flex;
		align-items: center;
		gap: var(--size-0);
	}

	span,
	a {
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}

	a {
		color: inherit;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	data {
		font-family: var(--font-mono);
	}

	data::before {
		content: '– ';
	}

	li.primary::before,
	li.context::before,
	li.band::before,
	li.negative::before,
	li.reference::before {
		width: var(--size-2);
		margin-right: var(--size-0);
		border-top: var(--size-line-0) solid var(--color-muted);
		content: '';
	}

	li.primary::before {
		border-top: var(--size-line-1) solid var(--color-ink);
	}

	li.reference::before {
		border-top-style: dashed;
	}

	li.negative {
		color: var(--color-negative);
	}

	li.negative::before {
		border-top-color: var(--color-negative);
	}

	li.faded {
		opacity: 0.6;
	}
</style>
