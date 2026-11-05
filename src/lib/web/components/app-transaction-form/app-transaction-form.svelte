<script lang="ts">
	import { listAccountNames } from '#lib/endpoints/accounts.remote.ts';
	import {
		createTransaction,
		deleteTransaction,
		saveTransaction,
	} from '#lib/endpoints/files.remote.ts';
	import type { RupeaError } from '#lib/server/shared/result/error.ts';
	import { TransactionForm } from '#lib/shared/transaction-form.ts';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import Field from '#lib/web/components/ui-field/ui-field.svelte';
	import LedgerTable from '#lib/web/components/app-ledger-table/app-ledger-table.svelte';
	import { explain } from '#lib/web/shared/errors.ts';
	import { formatIsoDate } from '#lib/web/shared/format.ts';
	import { fileHref } from '#lib/web/shared/links.ts';
	import { untrack } from 'svelte';
	import * as v from 'valibot';

	/** A ledger with no files yet starts this one. */
	const FIRST_FILE = 'transactions.rupea';

	const COLUMNS = [
		{ label: 'Account' },
		{ label: 'Amount', kind: 'amount' as const },
		{ label: '' },
	];
	const RARE_FIELDS = ['file', 'time', 'metadata', 'postings.0.commodity'];
	const RARE_POSTING_FIELDS = ['commodity', 'price', 'cost', 'balance', 'metadata'];

	const ACCOUNT_TYPE = /^(Assets|Liabilities|Income|Expenses|Equity)(:|$)/;
	const HELD = ['Assets', 'Liabilities'];

	/** What each kind asks for: the box whose account takes the amount, then the one it balances against. */
	const KINDS = {
		Expense: [
			{ label: 'Category', types: ['Expenses'], placeholder: 'Food' },
			{ label: 'Paid from', types: HELD, placeholder: 'Bank' },
		],
		Income: [
			{ label: 'Paid into', types: HELD, placeholder: 'Bank' },
			{ label: 'Source', types: ['Income'], placeholder: 'Salary' },
		],
		Transfer: [
			{ label: 'To', types: HELD, placeholder: 'Savings' },
			{ label: 'From', types: HELD, placeholder: 'Bank' },
		],
	};

	type Kind = keyof typeof KINDS;

	type Props = {
		handle: string;
		/** The files to pick from; a new name makes a new file. */
		keys: string[];
		/** The file picked at first. */
		newest: string | null;
		/** A transaction to change, as it was read from its file. */
		edit?: { file: string; line: number; version: string; form: TransactionForm } | undefined;
		/** Where leaving the form goes. */
		closeHref: string;
		/** Called after a transaction is written. */
		onsaved: () => void;
	};

	type Entries = { key: string; value: string }[];

	const { handle, keys, newest, edit, closeHref, onsaved }: Props = $props();

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
		more: untrack(() => edit !== undefined),
		split: untrack(() => edit !== undefined),
		accounts: [] as string[],
	});
	const simple = $state({
		kind: 'Expense' as Kind,
		amount: '',
		currency: '',
		accounts: ['', ''],
	});

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
		}));

	function split() {
		form.postings = postingsOfSimple();
		status.split = true;
	}

	function pick(kind: Kind) {
		simple.kind = kind;
		simple.accounts = ['', ''];
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		status.saved = null;
		status.errors = [];

		const postings = status.split ? form.postings : postingsOfSimple();
		const checked = v.safeParse(TransactionForm, { ...form, postings });
		const noAmount = !status.split && simple.amount.trim() === '';
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
		Object.assign(simple, { amount: '', accounts: ['', ''] });
		status.split = false;
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
				<input bind:value={entry.key} />
			</Field>
			<Field label="Value" issues={issuesAt(`${path}.${index}.value`)}>
				<input bind:value={entry.value} />
			</Field>
			<button type="button" class="link" onclick={() => list.splice(index, 1)}>Remove</button>
		</div>
	{/each}
	<div class="more">
		<button type="button" class="link" onclick={() => list.push({ key: '', value: '' })}
			>Add detail</button
		>
	</div>
{/snippet}

{#snippet problems(path: string)}
	{#each issuesAt(path) as issue (issue.message)}
		<p role="alert" class="problem">{issue.message}</p>
	{/each}
{/snippet}

<form onsubmit={save} novalidate>
	{#if !status.split}
		<div class="kinds" role="group" aria-label="Kind">
			{#each Object.keys(KINDS) as Kind[] as kind (kind)}
				<button
					type="button"
					class="link"
					aria-pressed={simple.kind === kind}
					onclick={() => pick(kind)}>{kind}</button
				>
			{/each}
		</div>
	{/if}

	<Field label="Description" issues={issuesAt('description')}>
		<input bind:value={form.description} />
	</Field>

	<div class="pair">
		{#if !status.split}
			<Field label="Amount" issues={issuesAt('postings.0.amount')}>
				<input bind:value={simple.amount} inputmode="decimal" />
			</Field>
		{/if}
		<Field label="Date" issues={issuesAt('date')}>
			<input type="date" bind:value={form.date} />
		</Field>
	</div>

	{#if !status.split}
		<div class="pair">
			{#each KINDS[simple.kind] as box, index (box.label)}
				<Field label={box.label} issues={issuesAt(`postings.${index}.account`)}>
					<input
						bind:value={simple.accounts[index]}
						list="transaction-accounts"
						placeholder={box.placeholder}
						spellcheck="false"
						oninput={(e) => suggestFor(e.currentTarget.value, box.types)}
						onfocus={(e) => suggestFor(e.currentTarget.value, box.types)}
					/>
				</Field>
			{/each}
		</div>
	{/if}

	<datalist id="transaction-files">
		{#each keys as key (key)}<option value={key}></option>{/each}
	</datalist>

	<div class="buttons">
		<Button
			type="button"
			aria-label="More details"
			aria-expanded={status.more}
			onclick={() => (status.more = !status.more)}
		>
			{status.more ? 'Less' : 'More'}
		</Button>
		{#if status.split}
			<Button type="button" onclick={() => form.postings.push(blank())}>Add line</Button>
		{/if}
		{#if !status.split}
			<Button type="button" onclick={split}>Split</Button>
		{/if}
	</div>

	{#if status.more || hasIssuesIn('', RARE_FIELDS)}
		<div class="rare">
			{#if !edit}
				<Field label="File" issues={issuesAt('file')}>
					<input bind:value={form.file} list="transaction-files" spellcheck="false" />
				</Field>
			{/if}
			{#if !status.split}
				<Field label="Currency" issues={issuesAt('postings.0.commodity')}>
					<input bind:value={simple.currency} placeholder="INR" />
				</Field>
			{/if}
			<Field label="Time" issues={issuesAt('time')}>
				<input type="time" step="1" bind:value={form.time} />
			</Field>
			<div class="wide">
				<Field label="Comment">
					<input bind:value={form.comment} />
				</Field>
			</div>
			{@render entries(form.metadata, 'metadata')}
		</div>
	{/if}

	<datalist id="transaction-accounts">
		{#each status.accounts as account (account)}<option value={account}></option>{/each}
	</datalist>

	{#if status.split}
		<LedgerTable columns={COLUMNS} label="Lines">
			{#each form.postings as posting, index (index)}
				{@const at = `postings.${index}`}
				<tbody>
					<tr>
						<td class="account">
							<input
								aria-label="Account"
								placeholder="Expenses:Food"
								bind:value={posting.account}
								list="transaction-accounts"
								spellcheck="false"
								oninput={(e) => suggest(e.currentTarget.value)}
								onfocus={(e) => suggest(e.currentTarget.value)}
							/>
							{@render problems(`${at}.account`)}
						</td>
						<td class="amount">
							<input
								aria-label="Amount"
								bind:value={posting.amount}
								inputmode="decimal"
								placeholder="Auto"
								size="8"
							/>
							{@render problems(`${at}.amount`)}
						</td>
						<td class="actions">
							<button
								type="button"
								class="link"
								aria-label="More about line {index + 1}"
								aria-expanded={posting.more}
								onclick={() => (posting.more = !posting.more)}
							>
								{posting.more ? 'Less' : 'More'}
							</button>
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
						</td>
					</tr>
					{#if posting.more || hasIssuesIn(`${at}.`, RARE_POSTING_FIELDS)}
						<tr class="child">
							<td colspan={COLUMNS.length}>
								<div class="rare">
									<Field label="Currency" issues={issuesAt(`${at}.commodity`)}>
										<input bind:value={posting.commodity} placeholder="INR" />
									</Field>
									<Field label="Price" issues={issuesAt(`${at}.price`)}>
										<input bind:value={posting.price} />
									</Field>
									<label class="check">
										<input type="checkbox" bind:checked={posting.total} />
										Price for all units
									</label>
									<Field label="Lot cost" issues={issuesAt(`${at}.cost`)}>
										<input bind:value={posting.cost} />
									</Field>
									<Field label="Lot date" issues={issuesAt(`${at}.costDate`)}>
										<input type="date" bind:value={posting.costDate} />
									</Field>
									<Field label="Balance after" issues={issuesAt(`${at}.balance`)}>
										<input bind:value={posting.balance} inputmode="decimal" />
									</Field>
									<div class="wide">
										<Field label="Comment">
											<input bind:value={posting.comment} />
										</Field>
									</div>
									{@render entries(posting.metadata, `${at}.metadata`)}
								</div>
							</td>
						</tr>
					{/if}
				</tbody>
			{/each}
		</LedgerTable>
	{/if}

	{#each status.errors as error, index (index)}
		<p role="alert">{explain(error)}</p>
	{/each}

	<div class="buttons">
		<Button primary disabled={createTransaction.pending + saveTransaction.pending > 0}>
			{edit ? 'Save changes' : 'Save'}
		</Button>
		{#if edit}
			<Button type="button" disabled={deleteTransaction.pending > 0} onclick={remove}>Delete</Button
			>
		{/if}
		<Button href={closeHref}>Cancel</Button>
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

	input:not([type='checkbox']) {
		width: 100%;
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-2);
	}

	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
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

	.link:hover {
		text-decoration: underline;
	}

	.rare {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(var(--size-7), 1fr));
		gap: var(--size-2);
		align-items: end;
	}

	.child .rare {
		padding-top: var(--size-2);
	}

	.entry {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: 1fr 1fr auto;
		gap: var(--size-2);
		align-items: end;
	}

	.amount input {
		width: auto;
		font-family: inherit;
		text-align: right;
	}

	.actions {
		width: 1%;
		white-space: nowrap;
	}

	.actions .link + .link {
		margin-left: var(--size-2);
	}

	.problem {
		margin: var(--size-1) 0 0;
		color: var(--color-negative);
		font-family: var(--font-body);
		font-size: var(--font-size-0);
		text-align: left;
		white-space: normal;
	}

	.check {
		display: flex;
		gap: var(--size-1);
		align-items: center;
	}

	p {
		margin: 0;
	}

	p[role='alert'] {
		color: var(--color-negative);
	}

	@media (width < 40rem) {
		.pair {
			grid-template-columns: 1fr;
		}

		form :global(thead) {
			display: none;
		}

		tr:not(.child) {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: var(--size-1);
		}

		.account,
		.actions {
			grid-column: 1 / -1;
		}

		tr:not(.child) td {
			width: auto;
			padding: 0;
		}

		.amount input {
			width: 100%;
		}
	}
</style>
