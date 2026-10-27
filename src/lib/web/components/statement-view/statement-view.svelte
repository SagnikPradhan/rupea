<script lang="ts">
	import {
		addFile,
		createFile,
		deleteFiles,
		editFile,
		findLatestFile,
		listFiles,
		parseFile,
		readFile,
		renameFiles,
	} from '#lib/endpoints/files.remote.ts';
	import {
		importStatement,
		listImports,
		listStatements,
		previewStatement,
		readStatement,
		recogniseStatement,
		unlockStatement,
	} from '#lib/endpoints/import.remote.ts';
	import type { RupeaError } from '#lib/server/shared/result/error.ts';
	import type { Reply } from '#lib/server/shared/result/reply.ts';
	import { isCounted } from '#lib/shared/folders.ts';
	import Button from '#lib/web/components/button/button.svelte';
	import Field from '#lib/web/components/field/field.svelte';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import Account from '#lib/web/components/ledger-table/account.svelte';
	import Amount from '#lib/web/components/ledger-table/amount.svelte';
	import LedgerTable from '#lib/web/components/ledger-table/ledger-table.svelte';
	import StatementFormat from '#lib/web/components/statement-format/statement-format.svelte';
	import { formatDate } from '#lib/web/shared/format.ts';
	import { fileHref } from '#lib/web/shared/links.ts';
	import { accountOf, statusOf, suggestedFile } from '#lib/web/shared/statements.ts';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';

	type Found = Awaited<ReturnType<typeof previewStatement>>;

	type Schema = { key: string; content: string };

	type Addition = {
		statement: string;
		from: string;
		to: string;
		version: string;
		added: number;
		skipped: number;
		before: string | null;
		draft: string;
	};

	const { handle, statement }: { handle: string; statement: string } = $props();

	const uploaded = $derived(await listStatements(handle));
	const imports = $derived(await listImports(handle));
	const row = $derived((uploaded.data ?? []).find((s) => s.key === statement));
	const job = $derived((imports.data ?? []).find((j) => j.statement === statement));
	const status = $derived(row ? statusOf(row, job) : null);
	const file = $derived(row?.file ?? null);

	const view = $state({
		ticket: 0,
		grid: [] as string[][],
		schema: null as Schema | null,
		setup: false,
		found: null as Found | null,
		errors: [] as RupeaError[],
	});
	const action = $state({ step: 'reading' as 'reading' | 'adding' | 'restarting', to: '' });
	const done = $state({ addition: null as Addition | null });

	const locked = $derived(
		view.errors.flatMap((e) => (e.type === 'ExtractionLocked' ? [e.path] : []))[0],
	);
	const found = $derived(view.found?.data ?? []);
	const problems = $derived(
		[...(job?.error ? [job.error] : []), ...view.errors].filter(
			(e) => !(view.setup && e.type === 'ExtractionUnrecognised'),
		),
	);
	const account = $derived(accountOf(statement, found));
	const latest = $derived(account ? (await findLatestFile({ handle, account })).data : null);
	const files = $derived(await listFiles(handle));
	const counted = $derived((files.data ?? []).map((f) => f.key).filter(isCounted));
	const addition = $derived(done.addition?.statement === statement ? done.addition : null);

	const sleep = (t: number) => new Promise<void>((r) => setTimeout(r, t));

	// Untracked: the commands below update their own pending state, which would re-run this effect.
	$effect(() => {
		const key = statement;
		const at = file;
		untrack(() => void load(key, at));
	});

	async function load(key: string, at: string | null) {
		const ticket = ++view.ticket;
		Object.assign(view, { grid: [], schema: null, setup: false, found: null, errors: [] });
		action.step = 'reading';
		if (at !== null && isCounted(at)) return;
		if (at !== null) return showDraft(ticket, at);

		await opened(ticket, await readStatement({ handle, statement: key }));
	}

	async function showDraft(ticket: number, key: string) {
		const read = await readFile({ handle, key });
		const parsed = read.data ? await parseFile({ key, content: read.data.content }) : null;
		if (ticket !== view.ticket) return;

		Object.assign(view, { found: parsed, errors: read.errors });
	}

	// A statement no saved or built-in format recognises opens its setup.
	async function opened(
		ticket: number,
		read: Reply<{ key: string; grid: string[][] }> | undefined,
	) {
		if (ticket !== view.ticket) return;

		view.errors = read?.errors ?? [];
		if (!read?.data) return;

		const recognised = await recogniseStatement({ handle, statement: read.data.key });
		if (ticket !== view.ticket) return;

		Object.assign(view, {
			grid: read.data.grid,
			schema: recognised.data ?? null,
			setup: recognised.data === null,
			errors: recognised.errors,
		});
		await preview(0);
	}

	async function preview(wait: number) {
		const ticket = view.ticket;
		const schema = view.schema;
		await sleep(wait);
		if (ticket !== view.ticket || schema !== view.schema || schema === null) return;

		const result = await previewStatement({ handle, statement, schema });
		if (ticket === view.ticket && schema === view.schema) view.found = result;
	}

	function change(schema: Schema) {
		view.schema = schema;
		void preview(300);
	}

	/** The draft waiting in review, filed first when there is none yet. */
	async function draft() {
		if (file !== null) return file;
		if (view.schema === null) return null;

		const made = await importStatement({ handle, statement, schema: view.schema });
		view.errors = made.errors;
		return made.data?.key ?? null;
	}

	/** The file this account went to last, or a new one named after it. */
	function startAdding() {
		Object.assign(action, { step: 'adding', to: latest ?? suggestedFile(statement, found) });
	}

	async function add(event: SubmitEvent) {
		event.preventDefault();
		const from = await draft();
		if (from === null) return;

		const added = await addFile({ handle, from, to: action.to.trim() });
		view.errors = added.errors;
		if (!added.data) return;

		const a = added.data;
		done.addition = {
			statement,
			from,
			to: a.file.key,
			version: a.file.version,
			added: a.added,
			skipped: a.skipped,
			before: a.before,
			draft: a.draft,
		};
		await listStatements(handle).refresh();
	}

	/** Puts the file back as it was, and the draft back in review. */
	async function undo() {
		const a = addition;
		if (a === null) return;

		const undone =
			a.before === null
				? [await renameFiles({ handle, moves: [{ from: a.to, to: a.from }] })]
				: [
						await editFile({ handle, key: a.to, content: a.before, version: a.version }),
						await createFile({ handle, key: a.from, content: a.draft }),
					];
		view.errors = undone.flatMap((u) => u.errors);
		done.addition = null;
		await listStatements(handle).refresh();
	}

	async function edit() {
		const key = await draft();
		if (key !== null) await goto(fileHref(handle, key));
	}

	async function restart() {
		if (file === null) return;

		const deleted = await deleteFiles({ handle, keys: [file] });
		view.errors = deleted.errors;
		await listStatements(handle).refresh();
	}
</script>

<section>
	{#if row === undefined}
		<p class="hint">This statement is no longer here.</p>
	{:else if addition}
		<div class="toolbar">
			<p>
				Added {addition.added} to <a href={fileHref(handle, addition.to)}>{addition.to}</a>.
				{#if addition.skipped > 0}Left out {addition.skipped} already there.{/if}
			</p>
			<Button onclick={undo}>Undo</Button>
		</div>
	{:else if status === 'added' && file !== null}
		<p>
			Its transactions are in the ledger, in <a href={fileHref(handle, file)}>{file}</a>.
		</p>
	{:else if status === 'reading'}
		<p class="hint">Reading this file…</p>
	{:else}
		<Issues {handle} errors={problems} detailed />

		{#if locked}
			<form
				class="toolbar"
				{...unlockStatement.enhance(async (form) => {
					await form.submit();
					await opened(view.ticket, form.result);
				})}
			>
				<input {...unlockStatement.fields.handle.as('hidden', handle)} />
				<input {...unlockStatement.fields.statement.as('hidden', locked)} />
				<Field label="This file has a password">
					<input {...unlockStatement.fields.password.as('password')} autocomplete="off" required />
				</Field>
				<Button primary disabled={unlockStatement.pending > 0}>Unlock</Button>
			</form>
		{/if}

		{#if view.setup && view.grid.length > 0}
			<div class="group">
				<h2>Describe this statement</h2>
				<p class="hint">
					Rupea doesn’t know this statement yet. Tell it which columns hold the date, description
					and amount; the transactions it finds show below as you type.
				</p>
				<StatementFormat
					{handle}
					grid={view.grid}
					schema={view.schema ?? { key: 'my-bank.yml', content: '' }}
					onchange={change}
				/>
			</div>
		{/if}

		{#if view.found}
			<div class="group">
				<div class="heading">
					<h2>
						{found.length}
						{found.length === 1 ? 'transaction' : 'transactions'} found
						{#if account}<span class="hint">for <Account {account} /></span>{/if}
					</h2>
					{#if action.step === 'reading'}
						<div class="toolbar">
							<Button primary disabled={found.length === 0} onclick={startAdding}>
								Add to ledger
							</Button>
							<Button onclick={edit} disabled={found.length === 0}>Edit transactions</Button>
							{#if status === 'ready'}
								<Button onclick={() => (action.step = 'restarting')}>Start over</Button>
							{/if}
						</div>
					{/if}
				</div>

				{#if action.step === 'adding'}
					<form class="toolbar" onsubmit={add}>
						<label>
							Add to file
							<input bind:value={action.to} list="ledger-files" required />
						</label>
						<datalist id="ledger-files">
							{#each counted as key (key)}<option value={key}></option>{/each}
						</datalist>
						<Button primary>Add</Button>
						<Button type="button" onclick={() => (action.step = 'reading')}>Cancel</Button>
					</form>
					<p class="hint">
						{counted.includes(action.to.trim())
							? 'Adds them to this file by date, leaving out any it holds already.'
							: 'Makes a new file.'}
					</p>
				{/if}
				{#if action.step === 'restarting'}
					<div class="toolbar" role="group" aria-label="Confirm start over">
						<p>Throw away this draft and its edits?</p>
						<Button primary onclick={restart}>Start over</Button>
						<Button onclick={() => (action.step = 'reading')}>Cancel</Button>
					</div>
				{/if}
				<Issues {handle} errors={view.found.errors} detailed />

				{#if found.length > 0}
					<LedgerTable
						label="Transactions found"
						columns={[
							{ label: 'Date', kind: 'date' },
							{ label: 'Description' },
							{ label: 'Amount', kind: 'amount' },
						]}
					>
						{#each found as transaction (transaction.line)}
							<tbody>
								<tr>
									<td class="date">
										<time datetime={transaction.date}>{formatDate(transaction.date)}</time>
									</td>
									<th scope="row" class="truncate" title={transaction.description}>
										{transaction.description}
									</th>
									<td></td>
								</tr>
								{#each transaction.postings as posting, index (index)}
									<tr class="child">
										<td></td>
										<td><Account account={posting.account} /></td>
										<Amount value={posting.quantity} />
									</tr>
								{/each}
							</tbody>
						{/each}
					</LedgerTable>
				{/if}

				{#if file === null && view.grid.length > 0 && !view.setup}
					<p class="hint">
						Read as {view.schema?.key}.
						<button class="link" onclick={() => (view.setup = true)}>
							Read it with another format
						</button>
					</p>
				{/if}
			</div>
		{/if}
	{/if}
</section>

<style>
	section,
	.group {
		display: flex;
		flex-direction: column;
	}

	section {
		gap: var(--size-5);
	}

	.group {
		gap: var(--size-2);
	}

	section > :global(*),
	.group > :global(*),
	.heading > :global(*) {
		margin: 0;
	}

	.heading {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-2);
		align-items: center;
		justify-content: space-between;
	}

	h2 {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-1);
		align-items: baseline;
	}

	.hint {
		color: var(--color-muted);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-1);
		align-items: end;
	}

	.toolbar p,
	.toolbar label {
		align-self: center;
		margin: 0;
	}

	.toolbar label {
		display: flex;
		flex: 1;
		gap: var(--size-1);
		align-items: center;
		white-space: nowrap;
	}

	.toolbar input {
		flex: 1;
		min-width: 0;
	}

	.link {
		padding: 0;
		border: none;
		background: none;
		color: var(--color-ink);
		font: inherit;
		text-decoration: underline;
	}
</style>
