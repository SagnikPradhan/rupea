<script lang="ts">
	import type { RupeeError } from '#lib/server/shared/result/error.ts';
	import { explain, placesOf } from '#lib/web/errors.ts';
	import { fileHref } from '#lib/web/links.ts';

	type Props = {
		handle: string;
		errors: RupeeError[];
		/** Warnings point at something worth a look; problems at something broken. */
		warning?: boolean;
	};

	const { handle, errors, warning = false }: Props = $props();
</script>

{#if errors.length > 0}
	<ul role="list" class:warning>
		{#each errors as error, i (i)}
			<li role={warning ? 'status' : 'alert'}>
				{explain(error)}
				{#each placesOf(error) as place (`${place.file}:${place.line}`)}
					<a href={fileHref(handle, place.file, place.line)}
						>{place.line ? `${place.file}:${place.line}` : place.file}</a
					>
				{/each}
			</li>
		{/each}
	</ul>
{/if}

<style>
	ul {
		padding-left: var(--size-2);
		border-left: 2px solid var(--color-negative);
	}

	li {
		color: var(--color-negative);
	}

	.warning {
		border-color: var(--color-border);
	}

	.warning li {
		color: var(--color-muted);
	}

	a {
		margin-left: var(--size-1);
		color: inherit;
		font-family: var(--font-mono);
		font-size: var(--font-size-0);
	}
</style>
