<script lang="ts">
	import type { RupeaError } from '@rupea/shared/error.ts';
	import { detail, explain, isWarning, placesOf } from '#lib/web/shared/errors.ts';
	import { fileHref } from '#lib/web/shared/links.ts';

	type Props = {
		handle: string;
		errors: RupeaError[];
		detailed?: boolean;
	};

	const { handle, errors, detailed = false }: Props = $props();

	const distinct = $derived([...new Map(errors.map((e) => [JSON.stringify(e), e])).values()]);

	const problems = $derived(distinct.filter((e) => !isWarning(e)));
	const warnings = $derived(distinct.filter(isWarning));
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
		padding-left: var(--size-2);
		border-left: var(--size-line-1) solid var(--color-negative);
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
