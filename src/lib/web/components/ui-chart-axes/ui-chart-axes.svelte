<script lang="ts">
	/** A label and where it stands along its axis, as a percent of the plot. */
	type Tick = { at: number; label: string };

	type Props = {
		/** Under the plot, such as dates. */
		across: Tick[];
		/** Beside it on the right, such as amounts. */
		up: Tick[];
	};

	const { across, up }: Props = $props();
</script>

{#each across as tick, i (i)}
	<span class="across" style:left="{tick.at}%">{tick.label}</span>
{/each}
{#each up as tick, i (i)}
	<span class="up" style:top="{tick.at}%">{tick.label}</span>
{/each}

<style>
	span {
		position: absolute;
		color: var(--color-muted);
		font: var(--font-size-0) var(--font-mono);
		line-height: 1;
		white-space: nowrap;
		pointer-events: none;
	}

	.across {
		top: 100%;
		margin-top: var(--size-1);
		transform: translateX(-50%);
	}

	.up {
		left: 100%;
		width: var(--size-4);
		text-align: end;
		transform: translateY(-50%);
	}
</style>
