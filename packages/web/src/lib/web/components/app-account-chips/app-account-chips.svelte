<script lang="ts">
	import Chip from '#lib/web/components/ui-chip/ui-chip.svelte';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { page } from '$app/state';

	type Props = {
		chips: { account: string; name: string; figure: string }[];
		account: string | null;
		tone?: 'negative';
	};

	const { chips, account, tone }: Props = $props();

	const longest = $derived(Math.max(...chips.map((c) => c.name.length + c.figure.length)));
</script>

<ul role="list" data-sveltekit-reset="false" style:--chip="{longest}ch">
	{#each chips as chip (chip.account)}
		<li>
			<Chip
				bare
				href={hrefWith(page.url.searchParams, {
					account: account === chip.account ? '' : chip.account,
				})}
				on={account === chip.account}
			>
				{chip.name}
				<span class={tone}>{chip.figure}</span>
			</Chip>
		</li>
	{/each}
</ul>

<style>
	ul {
		display: grid;
		grid-template-columns: repeat(
			auto-fill,
			min(100%, calc(var(--size-2) + var(--size-1) + var(--chip) + var(--size-1) + var(--size-0)))
		);
		gap: var(--size-1) var(--size-0);
		margin: 0;
		padding: 0;
		font: var(--text-label);
		list-style: none;
	}

	.negative {
		color: var(--color-negative);
	}
</style>
