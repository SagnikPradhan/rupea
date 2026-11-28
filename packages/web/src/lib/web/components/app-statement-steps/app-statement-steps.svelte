<script lang="ts">
	import IconCheck from '@tabler/icons-svelte-runes/icons/check';
	import IconChevron from '@tabler/icons-svelte-runes/icons/chevron-right';
	import { listImports, listStatements } from '#lib/endpoints/import.remote.ts';
	import { STEP_AT, STEPS, statusOf } from '#lib/web/shared/statements.ts';

	type Props = { handle: string; statement: string };

	const { handle, statement }: Props = $props();

	const uploaded = $derived(await listStatements(handle));
	const imports = $derived(await listImports(handle));
	const row = $derived((uploaded.data ?? []).find((s) => s.key === statement));
	const job = $derived((imports.data ?? []).find((j) => j.statement === statement));
	const status = $derived(row ? statusOf(row, job) : null);
	const at = $derived(status === null ? 0 : STEP_AT[status]);
</script>

{#if status !== null}
	<ol aria-label="Progress">
		{#each STEPS as step, i (step)}
			{@const state = i < at ? 'done' : i === at ? 'current' : 'next'}
			<li
				class={[state, { failed: status === 'failed' && state === 'current' }]}
				aria-current={state === 'current' ? 'step' : undefined}
			>
				<span class="mark">
					{#if state === 'done'}<IconCheck size={14} />{:else}{i + 1}{/if}
				</span>
				{step}
			</li>
			{#if i < STEPS.length - 1}
				<li class="between" aria-hidden="true"><IconChevron size={16} /></li>
			{/if}
		{/each}
	</ol>
{/if}

<style>
	ol {
		display: flex;
		margin: 0;
		padding: 0;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--size-1);
		list-style: none;
	}

	li {
		display: flex;
		align-items: center;
		gap: var(--size-1);
		color: var(--color-muted);
		font: var(--text-label);
	}

	.mark {
		display: grid;
		width: var(--size-3);
		height: var(--size-3);
		place-items: center;
		border: var(--size-line-0) solid var(--color-ink-4);
		border-radius: 50%;
	}

	.between {
		color: var(--color-ink-4);
	}

	.done {
		color: var(--color-ink);
	}

	.done .mark {
		color: var(--color-ink);
		background: var(--color-ink-2);
		border-color: transparent;
	}

	.current {
		color: var(--color-ink);
		font-weight: 500;
	}

	.current .mark {
		color: var(--color-surface);
		background: var(--color-ink);
		border-color: var(--color-ink);
	}

	.failed .mark {
		background: var(--color-negative);
		border-color: var(--color-negative);
	}
</style>
