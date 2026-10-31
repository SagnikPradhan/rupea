<script lang="ts">
	import { listAccountNames } from '#lib/endpoints/accounts.remote.ts';
	import { createTransaction } from '#lib/endpoints/files.remote.ts';
	import type { RupeaError } from '#lib/server/shared/result/error.ts';
	import { TransactionForm } from '#lib/shared/transaction-form.ts';
	import Button from '#lib/web/components/button/button.svelte';
	import Field from '#lib/web/components/field/field.svelte';
	import LedgerTable from '#lib/web/components/ledger-table/ledger-table.svelte';
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
		{ label: 'Currency' },
		{ label: '' },
	];
	const RARE_FIELDS = ['file', 'time', 'metadata', 'postings.0.commodity'];
	const RARE_POSTING_FIELDS = ['price', 'cost', 'balance', 'metadata'];

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
	};

	type Entries = { key: string; value: string }[];

	const { handle, keys, newest }: Props = $props();

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

	const form = $state({
		file: untrack(() => newest ?? keys[0] ?? FIRST_FILE),
		date: formatIsoDate(new Date()),
		time: '',
		description: '',
		comment: '',
		metadata: [] as Entries,
		postings: [blank(), blank()],
	});
	const status = $state({
		issues: {} as Record<string, { message: string }[]>,
		errors: [] as RupeaError[],
		saved: null as { file: string; line: number } | null,
		more: false,
		split: false,
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

		const created = await createTransaction({ handle, form: checked.output });
		status.errors = created.errors;
		if (!created.data) return;

		status.saved = created.data;
		Object.assign(form, {
			description: '',
			comment: '',
			metadata: [],
			postings: [blank(), blank()],
		});
		Object.assign(simple, { amount: '', accounts: ['', ''] });
		status.split = false;
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

	<div class="heading">
		{#if !status.split}
			<Field label="Amount" issues={issuesAt('postings.0.amount')}>
				<input bind:value={simple.amount} inputmode="decimal" />
			</Field>
		{/if}
		<div class="grow">
			<Field label="Description" issues={issuesAt('description')}>
				<input bind:value={form.description} />
			</Field>
		</div>
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

	<div>
		<button
			type="button"
			class="link"
			aria-label="More details"
			aria-expanded={status.more}
			onclick={() => (status.more = !status.more)}
		>
			{status.more ? 'Less' : 'More'}
		</button>
	</div>

	{#if status.more || hasIssuesIn('', RARE_FIELDS)}
		<div class="rare">
			<Field label="File" issues={issuesAt('file')}>
				<input bind:value={form.file} list="transaction-files" spellcheck="false" />
			</Field>
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
								size="12"
							/>
							{@render problems(`${at}.amount`)}
						</td>
						<td class="commodity">
							<input
								aria-label="Currency"
								bind:value={posting.commodity}
								placeholder="INR"
								size="6"
							/>
							{@render problems(`${at}.commodity`)}
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

		<div>
			<button type="button" class="link" onclick={() => form.postings.push(blank())}
				>Add line</button
			>
		</div>
	{:else}
		<div>
			<button type="button" class="link" onclick={split}>Split into several lines</button>
		</div>
	{/if}

	{#each status.errors as error, index (index)}
		<p role="alert">{explain(error)}</p>
	{/each}

	<div class="submit">
		<Button primary disabled={createTransaction.pending > 0}>Save</Button>
		{#if status.saved}
			<p role="status">
				Saved at
				<a href={fileHref(handle, status.saved.file, status.saved.line)}>
					{status.saved.file}:{status.saved.line}
				</a>
			</p>
		{/if}
	</div>
</form>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: var(--gap-group);
	}

	input:not([type='checkbox']) {
		width: 100%;
	}

	.heading {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-related);
	}

	.heading > :global(div) {
		flex: 1 1 var(--width-control);
	}

	.heading > .grow {
		flex-grow: 3;
	}

	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--gap-related);
	}

	.kinds {
		display: flex;
		gap: var(--gap-group);
	}

	.link[aria-pressed='true'] {
		color: var(--color-accent);
		text-decoration: underline 2px;
		text-underline-offset: var(--gap-tight);
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

	.child .rare {
		padding-top: var(--gap-related);
	}

	.rare {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(var(--width-control), 1fr));
		gap: var(--gap-related);
		align-items: end;
	}

	.entry {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: 1fr 1fr auto;
		gap: var(--gap-related);
		align-items: end;
	}

	.amount input {
		width: auto;
		font-family: inherit;
		text-align: right;
	}

	.commodity input {
		width: auto;
	}

	.commodity,
	.actions {
		width: 1%;
		white-space: nowrap;
	}

	.actions .link + .link {
		margin-left: var(--gap-related);
	}

	.problem {
		margin: var(--gap-label) 0 0;
		color: var(--color-negative);
		font-family: var(--font-body);
		font-size: var(--text-small);
		text-align: left;
		white-space: normal;
	}

	.check {
		display: flex;
		gap: var(--gap-label);
		align-items: center;
	}

	.submit {
		display: flex;
		gap: var(--gap-related);
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
			gap: var(--gap-label);
		}

		.account,
		.actions {
			grid-column: 1 / -1;
		}

		tr:not(.child) td {
			width: auto;
			padding: 0;
		}

		.amount input,
		.commodity input {
			width: 100%;
		}
	}
</style>
