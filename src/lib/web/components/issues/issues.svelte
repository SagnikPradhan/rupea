<script lang="ts">
	import type { RupeaError } from '#lib/server/shared/result/error.ts';
	import { detail, explain, isWarning, placesOf } from '#lib/web/shared/errors.ts';
	import { fileHref } from '#lib/web/shared/links.ts';

	type Props = {
		handle: string;
		errors: RupeaError[];
		/** Names every detail an error carries, for someone writing a schema. */
		detailed?: boolean;
	};

	const { handle, errors, detailed = false }: Props = $props();

	const problems = $derived(errors.filter((e) => !isWarning(e)));
	const warnings = $derived(errors.filter(isWarning));
</script>

{#snippet list(shown: RupeaError[], warning: boolean)}
	{#if shown.length > 0}
		<ul role="list" class:warning>
			{#each shown as error, i (i)}
				<li role={warning ? 'status' : 'alert'}>
					{detailed ? detail(error) : explain(error)}
					{#each placesOf(error) as place (`${place.file}:${place.line}`)}
						<a href={fileHref(handle, place.file, place.line)}
							>{place.line ? `${place.file}:${place.line}` : place.file}</a
						>
					{/each}
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{@render list(problems, false)}
{@render list(warnings, true)}

<style>
	ul {
		padding-left: var(--gap-related);
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
		margin-left: var(--gap-label);
		color: inherit;
		font-family: var(--font-mono);
		font-size: var(--text-small);
	}
</style>
