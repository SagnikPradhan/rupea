<script lang="ts">
	import { listCurrencies, saveBase } from '#lib/endpoints/ledger.remote.ts';
	import type { RupeaError } from '@rupea/shared/errors.ts';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import Select from '#lib/web/components/ui-select/ui-select.svelte';
	import Setting from '#lib/web/components/ui-setting/ui-setting.svelte';
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

<Setting
	id="{handle}-currency"
	title="Base currency"
	hint="Amounts written without a currency are in this one. Changing it relabels them and converts nothing."
>
	<form onsubmit={save} novalidate>
		<div class="pick">
			<Select
				label="Base currency"
				value={chosen.value}
				options={(currencies.data ?? [base]).map((c) => ({ value: c, label: c }))}
				onchange={(c: string) => (chosen.value = c)}
			/>
			<p>Only currencies a price in this ledger links to are offered.</p>
		</div>

		<Button primary>Save</Button>
		{#each [...(currencies.errors ?? []), ...chosen.errors] as error, i (i)}
			<p role="alert">{explain(error, formats)}</p>
		{/each}
		{#if chosen.saved}<p role="status">Saved.</p>{/if}
	</form>
</Setting>

<style>
	form {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--size-3);
	}

	.pick {
		display: flex;
		flex-direction: column;
		align-self: stretch;
		gap: var(--size-1);
	}

	.pick :global([data-select-trigger]) {
		width: 100%;
	}

	p {
		color: var(--color-muted);
		font: var(--text-label);
	}

	p[role='alert'] {
		color: var(--color-negative);
		font: var(--text-base);
	}

	p[role='status'] {
		font: var(--text-base);
	}
</style>
