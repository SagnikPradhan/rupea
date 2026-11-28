<script lang="ts">
	import { ICONS } from '#lib/web/shared/icons.ts';
	import { saveTerms } from '#lib/endpoints/accounts.remote.ts';
	import type { RupeaError } from '@rupea/shared/errors.ts';
	import { TermsForm } from '@rupea/shared/forms.ts';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import Field from '#lib/web/components/ui-field/ui-field.svelte';
	import Select from '#lib/web/components/ui-select/ui-select.svelte';
	import SegmentedControl from '#lib/web/components/ui-segmented-control/ui-segmented-control.svelte';
	import { explain } from '#lib/web/shared/errors.ts';
	import { formatsHere } from '#lib/web/shared/format.ts';
	import { untrack } from 'svelte';
	import * as v from 'valibot';

	const formats = formatsHere();

	const FIELDS: Record<'loan' | 'card', { key: string; label: string; hint: string }[]> = {
		loan: [
			{ key: 'rate', label: 'Interest rate', hint: 'A year, like 8.5.' },
			{ key: 'payment', label: 'Monthly payment', hint: 'The EMI.' },
			{ key: 'due', label: 'Due day', hint: 'Day of the month.' },
		],
		card: [
			{ key: 'limit', label: 'Card limit', hint: 'No currency sign.' },
			{ key: 'statement', label: 'Statement day', hint: 'Day of the month.' },
			{ key: 'due', label: 'Due day', hint: 'Day of the month.' },
			{ key: 'rate', label: 'Interest rate', hint: 'A year, like 42.' },
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
		current: Record<string, string>;
		onsaved: () => void;
		oncancel: () => void;
	};

	const { handle, account, current, onsaved, oncancel }: Props = $props();

	const first = (key: string) => untrack(() => current[key] ?? '');

	const form = $state({
		kind: untrack(() => (current['kind'] === 'card' ? 'card' : 'loan')) as 'loan' | 'card',
		method: untrack(() => (current['method'] === 'flat' ? 'flat' : 'reducing')) as
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
		...Object.entries(current).filter(([key]) => !known.includes(key)),
	]);

	const issuesAt = (key: string) => status.issues[key] ?? [];

	async function save(event: SubmitEvent) {
		event.preventDefault();
		status.saved = null;
		status.errors = [];

		const written = entries.filter(([, value]) => value.trim() !== '');
		const checked = v.safeParse(TermsForm, { account, entries: written });
		status.issues = Object.fromEntries(
			(checked.success ? [] : checked.issues).map((i) => [
				v.getDotPath(i) ?? 'entries',
				[{ message: i.message }],
			]),
		);
		if (!checked.success) return;

		const saved = await saveTerms({ handle, form: checked.output });
		status.errors = saved.errors;
		if (!saved.data) return;

		status.saved = saved.data.file;
		onsaved();
	}
</script>

<form onsubmit={save} novalidate autocomplete="off">
	<SegmentedControl
		label="Kind"
		segments={[
			{ name: 'Loan', chosen: form.kind === 'loan', onclick: () => (form.kind = 'loan') },
			{ name: 'Card', chosen: form.kind === 'card', onclick: () => (form.kind = 'card') },
		]}
	/>

	<div class="pair">
		{#each FIELDS[form.kind] as field (`${form.kind}-${field.key}`)}
			<Field label={field.label} hint={field.hint} issues={issuesAt(field.key)}>
				<input bind:value={form.values[field.key]} inputmode="decimal" />
			</Field>
		{/each}
		{#if form.kind === 'loan'}
			<Field label="Interest" hint="How the interest is worked out.">
				<Select
					value={form.method}
					options={Object.entries(METHODS).map(([value, label]) => ({ value, label }))}
					onchange={(value: string) => (form.method = value === 'flat' ? 'flat' : 'reducing')}
				/>
			</Field>
		{/if}
		{#if flat}
			<Field label="Months" hint="How long the loan runs." issues={issuesAt('tenure')}>
				<input bind:value={form.tenure} inputmode="numeric" />
			</Field>
		{/if}
	</div>

	{#each issuesAt('account') as issue (issue.message)}
		<p role="alert">{issue.message}</p>
	{/each}
	{#each issuesAt('entries') as issue (issue.message)}
		<p role="alert">{issue.message}</p>
	{/each}
	{#each status.errors as error, index (index)}
		<p role="alert">{explain(error, formats)}</p>
	{/each}

	<div class="buttons">
		<Button primary icon={ICONS.check} disabled={saveTerms.pending > 0}>Save</Button>
		<Button type="button" onclick={oncancel}>Cancel</Button>
	</div>

	{#if status.saved}<p role="status">Saved in {status.saved}</p>{/if}
</form>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}

	form > :global(nav) {
		align-self: start;
	}

	input,
	form :global([data-select-trigger]) {
		width: 100%;
	}

	.pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--size-3) var(--size-2);
	}

	.pair > :global(:last-child:nth-child(odd)) {
		grid-column: 1 / -1;
	}

	p {
		margin: 0;
	}

	p[role='alert'] {
		color: var(--color-negative);
	}

	.buttons {
		display: flex;
		gap: var(--size-1);
	}
</style>
