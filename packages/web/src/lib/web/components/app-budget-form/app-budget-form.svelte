<script lang="ts">
	import { ICONS } from '#lib/web/shared/icons.ts';
	import { saveBudget } from '#lib/endpoints/accounts.remote.ts';
	import type { RupeaError } from '@rupea/shared/errors.ts';
	import { BudgetForm } from '@rupea/shared/forms.ts';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import Field from '#lib/web/components/ui-field/ui-field.svelte';
	import Select from '#lib/web/components/ui-select/ui-select.svelte';
	import SegmentedControl from '#lib/web/components/ui-segmented-control/ui-segmented-control.svelte';
	import { startOf, startsOnOf } from '#lib/web/shared/budgets.ts';
	import { explain } from '#lib/web/shared/errors.ts';
	import { formatsHere } from '#lib/web/shared/format.ts';
	import { untrack } from 'svelte';
	import * as v from 'valibot';

	const formats = formatsHere();

	const MONTHS = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December',
	];

	const KNOWN = ['limit', 'period', 'start'];

	type Props = {
		handle: string;
		day: string;
		/** The days the budgets are listed over, which saving lists again. */
		shown: { from: string; to: string };
		/** Empty while adding, when the form asks for one of accounts. */
		account: string;
		accounts: string[];
		/**
		 * The B line the account has now, which the form keeps the keys of when it
		 * knows none of them.
		 */
		current: Record<string, string>;
		oncancel: () => void;
	};

	const { handle, day, shown, account, accounts, current, oncancel }: Props = $props();

	const today = $derived(Temporal.PlainDate.from(day));

	const form = $state({
		account: untrack(() => account),
		limit: untrack(() => current['limit'] ?? ''),
		length: untrack(() => (current['period'] === 'year' ? 'year' : 'month')) as 'month' | 'year',
		on: untrack(() => String(startsOnOf(current).on)),
	});
	const initial = untrack(() => ({ length: form.length }));
	const status = $state({
		issues: {} as Record<string, { message: string }[]>,
		errors: [] as RupeaError[],
		saved: null as { file: string; written: string } | null,
	});

	const on = $derived(Number(form.on));
	const valid = $derived(Number.isInteger(on) && on >= 1 && on <= 31);
	const unchanged = $derived(form.length === initial.length && on === startsOnOf(current).on);
	const start = $derived.by(() => {
		if (unchanged) return current['start'] ?? null;

		return startOf({ length: form.length, on, today });
	});

	const entries = $derived<[string, string][]>([
		['limit', form.limit],
		...(form.length === 'year' ? [['period', 'year'] as [string, string]] : []),
		...(start === null ? [] : [['start', start] as [string, string]]),
		...Object.entries(current).filter(([key]) => !KNOWN.includes(key)),
	]);

	const issuesAt = (key: string) => status.issues[key] ?? [];

	const choose = (length: 'month' | 'year') => {
		form.length = length;
		form.on = '1';
	};

	async function save(event: SubmitEvent) {
		event.preventDefault();
		status.saved = null;
		status.errors = [];
		if (!valid) {
			status.issues = { on: [{ message: 'Pick a day from 1 to 31.' }] };
			return;
		}

		const written = entries.filter(([, value]) => value.trim() !== '');
		const checked = v.safeParse(BudgetForm, { account: form.account, entries: written });
		status.issues = Object.fromEntries(
			(checked.success ? [] : checked.issues).map((i) => [
				v.getDotPath(i)!,
				[{ message: i.message }],
			]),
		);
		if (!checked.success) return;

		const saved = await saveBudget({
			handle,
			from: shown.from,
			day: shown.to,
			form: checked.output,
		});
		status.errors = saved.errors;
		if (!saved.data) return;

		status.saved = saved.data;
	}
</script>

<form onsubmit={save} novalidate autocomplete="off">
	{#if accounts.length > 0}
		<Field label="Account" hint="What the budget limits." issues={issuesAt('account')}>
			<Select
				value={form.account}
				placeholder="Pick an account"
				options={accounts.map((name) => ({ value: name, label: name }))}
				onchange={(name: string) => (form.account = name)}
			/>
		</Field>
	{/if}

	<Field label="Limit" hint="For each period. No currency sign.">
		<input bind:value={form.limit} inputmode="decimal" />
	</Field>

	<SegmentedControl
		label="Period"
		segments={[
			{ name: 'Each month', chosen: form.length === 'month', onclick: () => choose('month') },
			{ name: 'Each year', chosen: form.length === 'year', onclick: () => choose('year') },
		]}
	/>

	{#if form.length === 'month'}
		<Field label="Starts on" hint="Day of the month, 1 to 31." issues={issuesAt('on')}>
			<input bind:value={form.on} type="number" min="1" max="31" inputmode="numeric" />
		</Field>
	{/if}
	{#if form.length === 'year'}
		<Field label="Starts on" hint="The month the year begins.">
			<Select
				value={form.on}
				options={MONTHS.map((name, index) => ({ value: String(index + 1), label: name }))}
				onchange={(month: string) => (form.on = month)}
			/>
		</Field>
	{/if}

	{#each issuesAt('entries') as issue (issue.message)}
		<p role="alert">{issue.message}</p>
	{/each}
	{#each status.errors as error, index (index)}
		<p role="alert">{explain(error, formats)}</p>
	{/each}

	<div class="buttons">
		<Button primary icon={ICONS.check} disabled={saveBudget.pending > 0}>Save</Button>
		<Button type="button" onclick={oncancel}>Cancel</Button>
	</div>

	{#if status.saved}
		<p role="status">Saved in {status.saved.file}</p>
		<p class="written">{status.saved.written}</p>
	{/if}
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

	input {
		width: 100%;
	}

	p {
		margin: 0;
	}

	p[role='alert'] {
		color: var(--color-negative);
	}

	.written {
		color: var(--color-muted);
		font: var(--text-data);
		white-space: pre-wrap;
	}

	.buttons {
		display: flex;
		gap: var(--size-1);
	}
</style>
