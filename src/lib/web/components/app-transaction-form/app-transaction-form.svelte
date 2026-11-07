<script lang="ts">
	import { listAccountNames } from '#lib/endpoints/accounts.remote.ts';
	import {
		createTransaction,
		deleteTransaction,
		saveTransaction,
	} from '#lib/endpoints/files.remote.ts';
	import type { RupeaError } from '#lib/server/shared/result/error.ts';
	import { TransactionForm } from '#lib/shared/transaction-form.ts';
	import { KINDS, simpleOf, type Kind } from '#lib/shared/transaction-simple.ts';
	import IconRemove from '@tabler/icons-svelte-runes/icons/trash';
	import IconButton from '#lib/web/components/ui-button-icon/ui-button-icon.svelte';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import Field from '#lib/web/components/ui-field/ui-field.svelte';
	import SegmentedControl from '#lib/web/components/ui-segmented-control/ui-segmented-control.svelte';
	import { explain } from '#lib/web/shared/errors.ts';
	import { formatIsoDate } from '#lib/web/shared/format.ts';
	import { fileHref } from '#lib/web/shared/links.ts';
	import { untrack } from 'svelte';
	import * as v from 'valibot';

	/** A ledger with no files yet starts this one. */
	const FIRST_FILE = 'transactions.rupea';

	const RARE_POSTING_FIELDS = ['price', 'cost', 'balance', 'metadata'];

	const ACCOUNT_TYPE = /^(Assets|Liabilities|Income|Expenses|Equity)(:|$)/;

	type Props = {
		handle: string;
		/** The files to pick from; a new name makes a new file. */
		keys: string[];
		/** The file picked at first. */
		newest: string | null;
		/** A transaction to change, as it was read from its file. */
		edit?: { file: string; line: number; version: string; form: TransactionForm } | undefined;
		/** Called after a transaction is written. */
		onsaved: () => void;
	};

	type Entries = { key: string; value: string }[];

	const { handle, keys, newest, edit, onsaved }: Props = $props();

	const blank = () => ({
		account: '',
		amount: '',
		commodity: '',
		price: '',
		total: false,
		cost: '',
		costDate: '',
		balance: '',
		comment: '',
		metadata: [] as Entries,
		more: false,
	});

	const form = $state(
		untrack(() => ({
			file: edit?.file ?? newest ?? keys[0] ?? FIRST_FILE,
			date: edit?.form.date ?? formatIsoDate(new Date()),
			time: edit?.form.time ?? '',
			description: edit?.form.description ?? '',
			comment: edit?.form.comment ?? '',
			metadata: (edit?.form.metadata ?? []) as Entries,
			postings: edit?.form.postings.map((p) => ({ ...blank(), ...p })) ?? [blank(), blank()],
		})),
	);
	const status = $state({
		issues: {} as Record<string, { message: string }[]>,
		errors: [] as RupeaError[],
		saved: null as { file: string; line: number } | null,
		accounts: [] as string[],
	});
	const fit = untrack(() => (edit ? simpleOf(form.postings) : null));
	const simple = $state({
		kind: (fit?.kind ?? 'Expense') as Kind,
		amount: fit?.amount ?? '',
		currency: fit?.currency ?? '',
		accounts: fit?.accounts ?? ['', ''],
		balances: fit?.balances ?? ['', ''],
	});
	const mode = $state({ detail: untrack(() => edit !== undefined && fit === null) });
	const fitsSimple = $derived(simpleOf(form.postings) !== null);

	const focusOnAdd = (input: HTMLInputElement) => {
		if (!edit) input.focus();
	};

	const issuesAt = (path: string) => status.issues[path] ?? [];
	const hasIssuesIn = (path: string, fields: string[]) =>
		Object.keys(status.issues).some((p) => fields.some((f) => p.startsWith(`${path}${f}`)));

	async function suggest(prefix: string) {
		const names = await listAccountNames({ handle, prefix });
		status.accounts = names.data ?? [];
	}

	async function suggestFor(typed: string, types: string[]) {
		const prefixes = types.map((t) => qualified(typed, t).replace(/^$/, t));
		const names = await Promise.all(prefixes.map((prefix) => listAccountNames({ handle, prefix })));
		status.accounts = [...new Set(names.flatMap((n) => n.data ?? []))];
	}

	/** Someone new types Food and means Expenses:Food; a full account name stays as it is. */
	function qualified(typed: string, type: string) {
		const name = typed.trim().replace(/\s+/g, '-');
		if (name === '' || ACCOUNT_TYPE.test(name)) return name;
		return `${type}:${name}`;
	}

	/** The two sides of a simple entry; the second works out as the opposite of the first. */
	const postingsOfSimple = () =>
		KINDS[simple.kind].map((box, index) => ({
			...blank(),
			account: qualified(simple.accounts[index] ?? '', box.types[0] ?? ''),
			amount: index === 0 ? simple.amount : '',
			commodity: index === 0 ? simple.currency : '',
			balance: simple.balances[index] ?? '',
		}));

	/** An empty description in the simple view takes the name of the category, or Transfer. */
	const describedSimple = () => {
		if (simple.kind === 'Transfer') return 'Transfer';
		return simple.accounts[simple.kind === 'Expense' ? 0 : 1]?.trim().split(':').at(-1) ?? '';
	};

	function showDetail() {
		form.postings = postingsOfSimple();
		mode.detail = true;
	}

	function showSimple() {
		const fitting = simpleOf(form.postings);
		if (!fitting) return;

		Object.assign(simple, fitting);
		mode.detail = false;
	}

	function pick(kind: Kind) {
		simple.kind = kind;
		simple.accounts = ['', ''];
		simple.balances = ['', ''];
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		status.saved = null;
		status.errors = [];

		const postings = mode.detail ? form.postings : postingsOfSimple();
		const description = form.description.trim() || (mode.detail ? '' : describedSimple());
		const checked = v.safeParse(TransactionForm, { ...form, description, postings });
		const noAmount = !mode.detail && simple.amount.trim() === '';
		status.issues = {
			...(checked.success ? {} : issuesByPath(checked.issues)),
			...(noAmount ? { 'postings.0.amount': [{ message: 'Write an amount.' }] } : {}),
		};
		if (!checked.success || noAmount) return;

		const written = edit
			? await saveTransaction({
					handle,
					file: edit.file,
					line: edit.line,
					version: edit.version,
					form: checked.output,
				})
			: await createTransaction({ handle, form: checked.output });
		status.errors = written.errors;
		if (!written.data) return;

		status.saved = written.data;
		onsaved();
		if (edit) return;

		Object.assign(form, {
			description: '',
			comment: '',
			metadata: [],
			postings: [blank(), blank()],
		});
		Object.assign(simple, { amount: '', accounts: ['', ''], balances: ['', ''] });
		mode.detail = false;
	}

	async function remove() {
		if (!edit) return;

		const deleted = await deleteTransaction({
			handle,
			file: edit.file,
			line: edit.line,
			version: edit.version,
		});
		status.errors = deleted.errors;
		if (deleted.errors.length === 0) onsaved();
	}

	function issuesByPath(issues: Parameters<typeof v.getDotPath>[0][]) {
		const paths = Object.groupBy(issues, (i) => v.getDotPath(i) ?? '');
		return Object.fromEntries(
			Object.entries(paths).map(([path, group = []]) => [
				path,
				group.map((i) => ({ message: i.message })),
			]),
		);
	}
</script>

{#snippet entries(list: Entries, path: string)}
	{#each list as entry, index (index)}
		<div class="entry">
			<Field label="Key" issues={issuesAt(`${path}.${index}.key`)}>
				<input bind:value={entry.key} placeholder="e.g. invoice" />
			</Field>
			<Field label="Value" issues={issuesAt(`${path}.${index}.value`)}>
				<input bind:value={entry.value} placeholder="e.g. INV-402" />
			</Field>
			<IconButton label="Remove detail" icon={IconRemove} onclick={() => list.splice(index, 1)} />
		</div>
	{/each}
	<div class="more">
		<button type="button" class="link" onclick={() => list.push({ key: '', value: '' })}
			>Add detail</button
		>
	</div>
{/snippet}

{#snippet description()}
	<Field label="Description" hint="What it was, like Rent." issues={issuesAt('description')}>
		<input bind:value={form.description} />
	</Field>
{/snippet}

{#snippet day()}
	<div class="pair">
		<Field label="Date" hint="The day it happened." issues={issuesAt('date')}>
			<input type="date" bind:value={form.date} />
		</Field>
		{#if mode.detail}
			<Field label="Time" hint="To order within a day." issues={issuesAt('time')}>
				<input type="time" step="1" bind:value={form.time} />
			</Field>
		{/if}
	</div>
{/snippet}

<form onsubmit={save} novalidate autocomplete="off">
	<div class="kinds" role="group" aria-label="View">
		<button
			type="button"
			class="link"
			aria-pressed={!mode.detail}
			disabled={mode.detail && !fitsSimple}
			onclick={showSimple}>Simple</button
		>
		<button type="button" class="link" aria-pressed={mode.detail} onclick={showDetail}
			>Detail</button
		>
	</div>
	{#if mode.detail && !fitsSimple}
		<p class="reason">Simple fits two lines with an amount and nothing extra.</p>
	{/if}

	{#if !mode.detail}
		<SegmentedControl
			fill
			label="Kind"
			segments={Object.keys(KINDS).map((kind) => ({
				name: kind,
				chosen: simple.kind === kind,
				onclick: () => pick(kind as Kind),
			}))}
		/>
	{/if}

	{#if mode.detail}
		{@render description()}
		{@render day()}
	{/if}

	{#if !mode.detail}
		<Field label="Amount" hint="How much, no currency sign." issues={issuesAt('postings.0.amount')}>
			<input bind:value={simple.amount} inputmode="decimal" {@attach focusOnAdd} />
		</Field>

		<div class="pair">
			{#each KINDS[simple.kind] as box, index (box.label)}
				<Field label={box.label} hint={box.hint} issues={issuesAt(`postings.${index}.account`)}>
					<input
						bind:value={simple.accounts[index]}
						list="transaction-accounts"
						placeholder={box.placeholder}
						spellcheck="false"
						oninput={(e) => {
							simple.balances[index] = '';
							suggestFor(e.currentTarget.value, box.types);
						}}
						onfocus={(e) => suggestFor(e.currentTarget.value, box.types)}
					/>
				</Field>
			{/each}
		</div>

		{@render day()}
		{@render description()}
	{/if}

	<datalist id="transaction-accounts">
		{#each status.accounts as account (account)}<option value={account}></option>{/each}
	</datalist>

	{#if mode.detail}
		<section class="lines" aria-labelledby="lines-heading">
			<div class="intro">
				<h3 id="lines-heading">Lines</h3>
				<p>Each line moves money into or out of one account.</p>
			</div>
			{#each form.postings as posting, index (index)}
				{@const at = `postings.${index}`}
				<div class="line" role="group" aria-label="Line {index + 1}">
					<div class="title">
						<span>Line {index + 1}</span>
						{#if form.postings.length > 2}
							<button
								type="button"
								class="link"
								aria-label="Remove line {index + 1}"
								onclick={() => form.postings.splice(index, 1)}
							>
								Remove
							</button>
						{/if}
					</div>
					<div class="row">
						<Field label="Account" issues={issuesAt(`${at}.account`)}>
							<input
								placeholder="Expenses:Food"
								bind:value={posting.account}
								list="transaction-accounts"
								spellcheck="false"
								oninput={(e) => suggest(e.currentTarget.value)}
								onfocus={(e) => suggest(e.currentTarget.value)}
							/>
						</Field>
						<Field label="Amount" issues={issuesAt(`${at}.amount`)}>
							<input bind:value={posting.amount} inputmode="decimal" placeholder="Auto" />
						</Field>
						<Field label="Currency" issues={issuesAt(`${at}.commodity`)}>
							<input bind:value={posting.commodity} placeholder="INR" />
						</Field>
					</div>
					{#if posting.more || hasIssuesIn(`${at}.`, RARE_POSTING_FIELDS)}
						<div class="pair">
							<Field label="Price" hint="What one unit cost." issues={issuesAt(`${at}.price`)}>
								<input bind:value={posting.price} />
							</Field>
							<label class="check">
								<input type="checkbox" bind:checked={posting.total} />
								Price for all units
							</label>
							<Field label="Lot cost" hint="Cost of the units." issues={issuesAt(`${at}.cost`)}>
								<input bind:value={posting.cost} />
							</Field>
							<Field
								label="Lot date"
								hint="When they were bought."
								issues={issuesAt(`${at}.costDate`)}
							>
								<input type="date" bind:value={posting.costDate} />
							</Field>
							<Field
								label="Balance after"
								hint="What is left after this."
								issues={issuesAt(`${at}.balance`)}
							>
								<input bind:value={posting.balance} inputmode="decimal" />
							</Field>
							<div class="more">
								<Field label="Comment" hint="A note kept with it.">
									<textarea bind:value={posting.comment} rows="2"></textarea>
								</Field>
							</div>
							{@render entries(posting.metadata, `${at}.metadata`)}
						</div>
					{/if}
					<div class="tools">
						<button
							type="button"
							class="link"
							aria-label="More about line {index + 1}"
							aria-expanded={posting.more}
							onclick={() => (posting.more = !posting.more)}
						>
							{posting.more ? 'Hide extra fields' : 'Extra fields'}
						</button>
					</div>
				</div>
			{/each}
		</section>
		<Button type="button" onclick={() => form.postings.push(blank())}>Add a line</Button>

		<Field label="Comment" hint="A note kept with it.">
			<textarea bind:value={form.comment} rows="2"></textarea>
		</Field>

		{#if !edit}
			<Field label="File" hint="A new name starts a new file." issues={issuesAt('file')}>
				<input bind:value={form.file} list="transaction-files" spellcheck="false" />
			</Field>
		{/if}

		{@render entries(form.metadata, 'metadata')}

		<datalist id="transaction-files">
			{#each keys as key (key)}<option value={key}></option>{/each}
		</datalist>
	{/if}

	{#each status.errors as error, index (index)}
		<p role="alert">{explain(error)}</p>
	{/each}

	<div class="buttons">
		<Button primary disabled={createTransaction.pending + saveTransaction.pending > 0}>
			{edit ? 'Save changes' : 'Save'}
		</Button>
		{#if edit}
			<Button type="button" destructive disabled={deleteTransaction.pending > 0} onclick={remove}>
				Delete
			</Button>
		{/if}
	</div>

	{#if status.saved}
		<p role="status">
			Saved at
			<a href={fileHref(handle, status.saved.file, status.saved.line)}>
				{status.saved.file}:{status.saved.line}
			</a>
		</p>
	{/if}
</form>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}

	input:not([type='checkbox']),
	textarea {
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
		flex-wrap: wrap;
		gap: var(--size-2);
		padding-block-start: var(--size-3);
		border-block-start: var(--size-line-0) solid var(--color-border);
	}

	.pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--size-2);
	}

	.kinds {
		display: flex;
		gap: var(--size-3);
	}

	.link[aria-pressed='true'] {
		color: var(--color-accent);
		text-decoration: underline var(--size-line-1);
		text-underline-offset: var(--size-0);
	}

	.pair > :global(:only-child),
	.wide,
	.more {
		grid-column: 1 / -1;
	}

	.link {
		padding: 0;
		border: none;
		background: none;
		font: inherit;
	}

	form > :global(button) {
		align-self: start;
	}

	.link:disabled {
		color: var(--color-muted);
	}

	.link:hover:not(:disabled) {
		text-decoration: underline;
	}

	.reason {
		color: var(--color-muted);
		font: var(--text-label);
	}

	.lines {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
	}

	.intro h3 {
		margin: 0;
		font: var(--text-base);
	}

	.intro p {
		color: var(--color-muted);
		font: var(--text-label);
	}

	.title {
		display: flex;
		justify-content: space-between;
		color: var(--color-muted);
		font: var(--text-label);
	}

	.line {
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
	}

	.line + .line {
		padding-block-start: var(--size-3);
		border-block-start: var(--size-line-0) solid var(--color-border);
	}

	.row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--size-2);
		align-items: start;
	}

	.row > :global(:first-child) {
		grid-column: 1 / -1;
	}

	.tools {
		display: flex;
		gap: var(--size-3);
		justify-content: end;
	}

	.entry {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
		gap: var(--size-2);
		align-items: end;
	}

	.check {
		align-self: end;
		padding-block: var(--size-2);
		display: flex;
		gap: var(--size-1);
		align-items: center;
	}

	@media (width < 40rem) {
		.pair {
			grid-template-columns: 1fr;
		}
	}
</style>
