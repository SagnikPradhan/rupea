<script lang="ts">
	import {
		addFile,
		createFile,
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
	import type { RupeaError, Reply } from '@rupea/shared/errors.ts';
	import { isCounted } from '@rupea/shared/files.ts';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import Original from '#lib/web/components/app-statement-original/app-statement-original.svelte';
	import Dialog from '#lib/web/components/ui-dialog/ui-dialog.svelte';
	import Combobox from '#lib/web/components/ui-combobox/ui-combobox.svelte';
	import Field from '#lib/web/components/ui-field/ui-field.svelte';
	import Combobox from '#lib/web/components/ui-combobox/ui-combobox.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import Account from '#lib/web/components/app-ledger-table/account.svelte';
	import TransactionsFound from '#lib/web/components/app-transactions-found/app-transactions-found.svelte';
	import StatementFormat from '#lib/web/components/app-statement-format/app-statement-format.svelte';
	import type { TransactionView } from '#lib/endpoints/views.ts';
	import { fileHref } from '#lib/web/shared/links.ts';
	import { accountOf, statusOf, suggestedFile } from '#lib/web/shared/statements.ts';
	import { untrack, type Snippet } from 'svelte';

	const formats = formatsHere();

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

	type Props = {
		handle: string;
		statement: string;
		/** Changes when a transaction of the draft was saved, to read it again. */
		revision: number;
		/** Whether the draft has edits not saved yet. */
		dirty: boolean;
		/**
		 * Shows the draft like any file, given the button and the form for adding
		 * it.
		 */
		filed: Snippet<[Snippet, Snippet, Snippet]>;
	};

	const { handle, statement, revision, dirty, filed }: Props = $props();

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
		found: null as Reply<TransactionView[]> | null,
		errors: [] as RupeaError[],
	});
	const action = $state({ step: 'reading' as 'reading' | 'adding', to: '' });
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
	const [latestFile, files] = $derived(
		await Promise.all([account ? findLatestFile({ handle, account }) : null, listFiles(handle)]),
	);
	const latest = $derived(latestFile?.data ?? null);
	const counted = $derived((files.data ?? []).map((f) => f.key).filter(isCounted));
	const addition = $derived(done.addition?.statement === statement ? done.addition : null);

	const drafted = $derived(file !== null && !isCounted(file));

	const sleep = (t: number) => new Promise<void>((r) => setTimeout(r, t));

	// Untracked: the commands below update their own pending state, which would re-run this effect.
	$effect(() => {
		const key = statement;
		const draftKey = file;
		void revision;
		untrack(() => void load(key, draftKey));
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
		const parsed = read.data ? await parseFile({ handle, key, content: read.data.content }) : null;
		if (ticket !== view.ticket) return;

		Object.assign(view, { found: parsed, errors: read.errors });
	}

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

	async function draft() {
		if (file !== null) return file;
		if (view.schema === null) return null;

		const made = await importStatement({ handle, statement, schema: view.schema });
		view.errors = made.errors;
		return made.data?.key ?? null;
	}

	function startAdding() {
		const to = latest ?? suggestedFile(statement, found);
		Object.assign(action, { step: 'adding', to });
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
		if ((await draft()) !== null) await listStatements(handle).refresh();
	}
</script>

{#snippet next()}
	<Button primary disabled={dirty || found.length === 0} onclick={startAdding}>
		Add to ledger
	</Button>
{/snippet}

{#snippet form()}
	<Dialog
		title="Add to ledger"
		open={action.step === 'adding'}
		onclose={() => (action.step = 'reading')}
	>
		<form onsubmit={add}>
			<Field label="Add to file">
				<Combobox
					value={action.to}
					options={counted}
					onchange={(key: string) => (action.to = key)}
				/>
			</Field>

			<p class="hint">
				{counted.includes(action.to.trim())
					? 'Adds them to this file by date, leaving out any it holds already.'
					: 'Makes a new file.'}
			</p>

			<footer>
				<Button type="button" onclick={() => (action.step = 'reading')}>Cancel</Button>
				<Button primary>Add</Button>
			</footer>
		</form>
	</Dialog>
{/snippet}

{#snippet original()}
	<Original {handle} {statement} />
{/snippet}

{#snippet below()}
	<Issues {handle} errors={view.errors} detailed />
	{@render form()}
{/snippet}

{#if drafted && !addition}
	{@render filed(next, below, original)}
{:else}
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
						<input
							{...unlockStatement.fields.password.as('password')}
							autocomplete="off"
							required
						/>
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
						<p class="found">
							{found.length}
							{found.length === 1 ? 'transaction' : 'transactions'} found
							{#if account}for <Account {account} />{/if}
						</p>
						{#if action.step === 'reading'}
							<div class="toolbar">
								<Button primary disabled={found.length === 0} onclick={startAdding}>
									Add to ledger
								</Button>
								<Button onclick={edit} disabled={found.length === 0}>Edit transactions</Button>
							</div>
						{/if}
					</div>

					{@render form()}
					<Issues {handle} errors={view.found.errors} detailed />

					{#if found.length > 0}
						<TransactionsFound transactions={found} editable={false} chosen={null} />
					{/if}

					{#if view.grid.length > 0 && !view.setup}
						<p class="hint">
							Read as {view.schema?.key}.
							<button class="link" onclick={() => (view.setup = true)}>
								Read it with another schema
							</button>
						</p>
					{/if}
				</div>
			{/if}
		{/if}
	</section>
{/if}

<style>
	section,
	.group {
		display: flex;
		flex-direction: column;
	}

	section {
		gap: var(--size-4);
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
		align-items: center;
		justify-content: space-between;
		gap: var(--size-2);
	}

	h2 {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--size-1);
	}

	.found {
		color: var(--color-muted);
	}

	.hint {
		color: var(--color-muted);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--size-1);
	}

	.toolbar p {
		align-self: center;
	}

	form input {
		width: 100%;
	}

	.toolbar input {
		min-width: 0;
		flex: 1;
	}

	.link {
		padding: 0;
		color: var(--color-ink);
		font: inherit;
		text-decoration: underline;
		background: none;
		border: none;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
	}

	form > :global(*) {
		margin: 0;
	}

	footer {
		display: flex;
		gap: var(--size-1);
		justify-content: flex-end;
	}
</style>
