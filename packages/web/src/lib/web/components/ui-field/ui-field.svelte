<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		label: string;
		/** One line under the label saying what the box takes. */
		hint?: string | undefined;
		issues?: { message: string }[] | undefined;
		children: Snippet;
	};

	const { label, hint, issues = [], children }: Props = $props();

	const id = $props.id();

	const describing = (e: HTMLElement) => {
		if (hint)
			e.querySelector('input, select, textarea')?.setAttribute('aria-describedby', `${id}-hint`);
	};
</script>

<div>
	<label {@attach describing}>
		<span class="text">
			<span>{label}</span>
			{#if hint}<small id="{id}-hint" aria-hidden="true">{hint}</small>{/if}
		</span>
		{@render children()}
	</label>
	{#each issues as issue (issue.message)}
		<p role="alert">{issue.message}</p>
	{/each}
</div>

<style>
	label {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
		align-items: start;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: var(--size-0);
	}

	small {
		color: var(--color-ink-6);
		font: var(--text-label);
	}

	p {
		margin: var(--size-1) 0 0;
		color: var(--color-negative);
		font: var(--text-label);
	}
</style>
