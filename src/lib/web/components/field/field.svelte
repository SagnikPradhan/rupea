<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		label: string;
		issues?: { message: string }[] | undefined;
		children: Snippet;
	};

	const { label, issues = [], children }: Props = $props();
</script>

<div>
	<label>
		{label}
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
		gap: var(--gap-label);
		align-items: start;
	}

	p {
		margin: var(--gap-label) 0 0;
		color: var(--color-negative);
		font-size: var(--text-small);
	}
</style>
