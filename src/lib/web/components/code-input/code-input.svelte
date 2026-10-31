<script lang="ts">
	import { PinInput, type PinInputRootProps } from 'bits-ui';

	const props: PinInputRootProps = $props();
</script>

<PinInput.Root class="code" inputmode="numeric" autocomplete="one-time-code" {...props}>
	{#snippet children({ cells })}
		{#each cells as cell, i (i)}
			<PinInput.Cell class="cell" {cell}>{cell.char}</PinInput.Cell>
		{/each}
	{/snippet}
</PinInput.Root>

<style>
	:global(.code) {
		display: flex;
		gap: var(--gap-label);
	}

	:global(.code .cell) {
		display: grid;
		place-items: center;
		width: var(--gap-block);
		height: var(--gap-block);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background-color: var(--color-surface);
		font-family: var(--font-mono);
		font-size: var(--text-heading);
	}

	:global(.code .cell[data-active]) {
		border-color: var(--color-accent);
		outline: 1px solid var(--color-accent);
	}
</style>
