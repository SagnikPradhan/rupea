<script lang="ts">
	import { saveTerms } from '#lib/endpoints/accounts.remote.ts';
	import type { RupeaError } from '#lib/server/shared/result/error.ts';
	import { Terms, TermsForm } from '#lib/shared/terms.ts';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import Field from '#lib/web/components/ui-field/ui-field.svelte';
	import SegmentedControl from '#lib/web/components/ui-segmented-control/ui-segmented-control.svelte';
	import { explain } from '#lib/web/shared/errors.ts';
	import { untrack } from 'svelte';
	import * as v from 'valibot';

	const FIELDS: Record<'loan' | 'card', { key: string; label: string; hint: string }[]> = {
		loan: [
			{ key: 'rate', label: 'Interest rate', hint: 'A year, like 8.5.' },
			{ key: 'payment', label: 'Monthly payment', hint: 'The EMI, no currency sign.' },
			{ key: 'due', label: 'Due day', hint: 'Day of the month, like 5.' },
		],
		card: [
			{ key: 'limit', label: 'Card limit', hint: 'No currency sign.' },
			{ key: 'statement', label: 'Statement day', hint: 'Day of the month, like 1.' },
			{ key: 'due', label: 'Due day', hint: 'Day of the month, like 20.' },
			{ key: 'apr', label: 'Interest rate', hint: 'A year, like 42.' },
		],
	};

	const METHODS = { reducing: 'Falls as you pay', flat: 'Fixed on the amount borrowed' };

	type Props = {
		handle: string;
		account: string;
		/**
		 * The dash lines the account has now, which the form keeps when it knows
		 * none of them.
		 */
		current: Record<string, string[]>;
		onsaved: () => void;
	};

	const { handle, account, current, onsaved }: Props = $props();

	const first = (key: string) => untrack(() => current[key]?.[0] ?? '');

	const form = $state({
		kind: untrack(() => (current['kind']?.[0] === 'card' ? 'card' : 'loan')) as 'loan' | 'card',
		method: untrack(() => (current['method']?.[0] === 'flat' ? 'flat' : 'reducing')) as
			'reducing' | 'flat',
		tenure: first('tenure'),
		values: Object.fromEntries(
			Object.values(FIELDS)
				.flat()
				.map((f) => [f.key, first(f.key)]),
		),
	});
	const status = $state({
		issues: {} as Record<string, { message: string }[]>,
		errors: [] as RupeaError[],
		saved: null as string | null,
	});

	const known = [
		'kind',
		'method',
		'tenure',
		...Object.values(FIELDS)
			.flat()
			.map((f) => f.key),
	];
	const flat = $derived(form.kind === 'loan' && form.method === 'flat');

	const entries = $derived<[string, string][]>([
		['kind', form.kind],
		...FIELDS[form.kind].map((f): [string, string] => [f.key, form.values[f.key] ?? '']),
		...(flat
			? [['method', 'flat'] as [string, string], ['tenure', form.tenure] as [string, string]]
			: []),
		...Object.entries(current)
			.filter(([key]) => !known.includes(key))
			.flatMap(([key, values]) => values.map((x): [string, string] => [key, x])),
	]);

	const issuesAt = (key: string) => status.issues[key] ?? [];

	async function save(event: SubmitEvent) {
		event.preventDefault();
		status.saved = null;
		status.errors = [];

		const written = entries.filter(([, value]) => value.trim() !== '');
		const checked = v.safeParse(TermsForm, { account, entries: written });
		const typed = v.safeParse(Terms, Object.fromEntries(written));
		status.issues = Object.fromEntries(
			(typed.success ? [] : typed.issues).flatMap((i) => {
				const key = v.getDotPath(i);
				return key ? [[key, [{ message: 'Check this against the hint.' }]]] : [];
			}),
		);
		if (!checked.success || !typed.success) return;

		const saved = await saveTerms({ handle, form: checked.output });
		status.errors = saved.errors;
		if (!saved.data) return;

		status.saved = saved.data.file;
		onsaved();
	}
</script>

<form onsubmit={save} novalidate autocomplete="off">
	<SegmentedControl
		fill
		label="Kind"
		segments={[
			{ name: 'Loan', chosen: form.kind === 'loan', onclick: () => (form.kind = 'loan') },
			{ name: 'Card', chosen: form.kind === 'card', onclick: () => (form.kind = 'card') },
		]}
	/>

	{#each FIELDS[form.kind] as field (`${form.kind}-${field.key}`)}
		<Field label={field.label} hint={field.hint} issues={issuesAt(field.key)}>
			<input bind:value={form.values[field.key]} inputmode="decimal" />
		</Field>
	{/each}

	{#if form.kind === 'loan'}
		<Field label="Interest" hint="How the interest is worked out.">
			<select bind:value={form.method}>
				{#each Object.entries(METHODS) as [value, label] (value)}
					<option {value}>{label}</option>
				{/each}
			</select>
		</Field>
	{/if}
	{#if flat}
		<Field label="Months" hint="How long the loan runs." issues={issuesAt('tenure')}>
			<input bind:value={form.tenure} inputmode="numeric" />
		</Field>
	{/if}

	{#each status.errors as error, index (index)}
		<p role="alert">{explain(error)}</p>
	{/each}

	<div class="buttons">
		<Button primary disabled={saveTerms.pending > 0}>Save</Button>
	</div>

	{#if status.saved}<p role="status">Saved in {status.saved}</p>{/if}
</form>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}

	input,
	select {
		width: 100%;
	}

	p {
		margin: 0;
	}

	p[role='alert'] {
		color: var(--color-negative);
	}

	.buttons {
		display: flex;
		padding-block-start: var(--size-3);
		border-block-start: var(--size-line-0) solid var(--color-border);
	}
</style>
