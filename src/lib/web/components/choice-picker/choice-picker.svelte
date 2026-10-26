<script lang="ts">
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { page } from '$app/state';

	type Props = {
		/** The query parameter the choice is kept in. */
		param: string;
		label: string;
		/** Each value the parameter can take, and its name. */
		choices: Record<string, string>;
		current: string;
	};

	const { param, label, choices, current }: Props = $props();
</script>

<nav aria-label={label}>
	{#each Object.entries(choices) as [value, name] (value)}
		<a
			href={hrefWith(page.url.searchParams, { [param]: value })}
			class="label plain"
			aria-current={value === current ? 'page' : undefined}>{name}</a
		>
	{/each}
</nav>

<style>
	nav {
		display: flex;
		gap: var(--size-2);
	}

	a:hover {
		color: var(--color-ink);
		text-decoration: none;
	}
</style>
