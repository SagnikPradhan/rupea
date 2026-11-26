<script lang="ts">
	import { listCurrencies, saveBase } from '#lib/endpoints/ledger.remote.ts';
	import type { RupeaError } from '@rupea/shared/errors.ts';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import Field from '#lib/web/components/ui-field/ui-field.svelte';
	import { explain } from '#lib/web/shared/errors.ts';
	import { formatsHere } from '#lib/web/shared/format.ts';
	import { refreshAll } from '$app/navigation';
	import { untrack } from 'svelte';

	const formats = formatsHere();

	type Props = { handle: string; base: string };

	const { handle, base }: Props = $props();

	const currencies = $derived(await listCurrencies(handle));
	const chosen = $state({
		value: untrack(() => base),
		errors: [] as RupeaError[],
		saved: false,
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		chosen.saved = false;

		const saved = await saveBase({ handle, base: chosen.value });
		chosen.errors = saved.errors;
		chosen.saved = saved.errors.length === 0;
		if (chosen.saved) await refreshAll();
	}
</script>

<form onsubmit={save} novalidate>
	<Field
		label="Base currency"
		hint="Amounts written without a currency are in this one. Changing it relabels them and converts nothing."
	>
		<select value={chosen.value} onchange={(e) => (chosen.value = e.currentTarget.value)}>
			{#each currencies.data ?? [base] as c (c)}<option value={c}>{c}</option>{/each}
		</select>
	</Field>
	<p>Only currencies a price in this ledger links to are offered.</p>
	<Button primary>Save currency</Button>
	{#each [...(currencies.errors ?? []), ...chosen.errors] as error, i (i)}
		<p role="alert">{explain(error, formats)}</p>
	{/each}
	{#if chosen.saved}<p role="status">Saved.</p>{/if}
</form>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
		align-items: start;
	}

	p {
		margin: 0;
		color: var(--color-muted);
	}

	p[role='alert'] {
		color: var(--color-negative);
	}
</style>
