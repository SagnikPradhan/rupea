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
		gap: var(--size-1);
	}

	:global(.code .cell) {
		display: grid;
		place-items: center;
		width: var(--size-4);
		height: var(--size-4);
		border: var(--line) solid var(--color-border);
		border-radius: var(--radius);
		background-color: var(--color-surface);
		font-family: var(--font-mono);
		font-size: var(--font-size-2);
	}

	:global(.code .cell[data-active]) {
		border-color: var(--color-accent);
		outline: var(--line) solid var(--color-accent);
	}
</style>
