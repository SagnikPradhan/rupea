<script lang="ts">
	import {
		listImports,
		listInbox,
		importStatement,
		readStatement,
		previewStatement,
		recogniseStatement,
		unlockStatement,
		uploadStatements,
	} from '#lib/endpoints/import.remote.ts';
	import { listFiles } from '#lib/endpoints/files.remote.ts';
	import {
		deleteSchema,
		readSchema,
		listSchemas,
		saveSchema,
	} from '#lib/endpoints/schemas.remote.ts';
	import type { RupeeError } from '#lib/server/shared/result/error.ts';
	import PageHeader from '#lib/web/components/page-header/page-header.svelte';
	import { detail } from '#lib/web/shared/errors.ts';
	import { formatColumn } from '#lib/web/shared/format.ts';
	import { ledgerCrumb } from '#lib/web/shared/links.ts';
	import type { Reply } from '#lib/server/shared/result/reply.ts';
	import { fileHref } from '#lib/web/shared/links.ts';
	import { UPLOAD_EXTENSIONS } from '#lib/shared/statements.ts';
	import { goto } from '$app/navigation';

	type Preview = Awaited<ReturnType<typeof previewStatement>>;

	/** A starting point: Rupee's built-in HDFC savings schema, which the manual walks through. */
	const example = `version: v1
name: HDFC Bank savings account
match:
  - text: HDFC
account: Assets:Bank:HDFC
header:
  text: Narration
fields:
  date: { from: [header: Date], pipe: [date: dd/MM/yy] }
  description: { from: [header: Narration] }
  amount:
    - from: [header: Withdrawal Amt.]
      pipe: [number, negate]
    - from: [header: Deposit Amt.]
      pipe: [number]
  balance: { from: [header: Closing Balance], pipe: [number] }
`;

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const schemas = $derived(await listSchemas(handle));
	const inbox = $derived(await listInbox(handle));
	const imports = $derived(await listImports(handle));
	const running = $derived(
		(imports.data ?? []).some((j) => j.status === 'queued' || j.status === 'running'),
	);

	const statement = $state({ key: '', grid: [] as string[][], errors: [] as RupeeError[] });
	const editor = $state({
		key: 'my-bank.yml',
		content: example,
		errors: [] as RupeeError[],
		saved: false,
	});
	const preview = $state({ ticket: 0, result: null as Preview | null });

	const locked = $derived(
		statement.errors.flatMap((e) => (e.type === 'ExtractionLocked' ? [e.path] : []))[0],
	);
	const width = $derived(Math.max(0, ...statement.grid.map((r) => r.length)));
	const columns = $derived([...Array(width).keys()].map(formatColumn));

	const sleep = (t: number) => new Promise<void>((r) => setTimeout(r, t));

	async function apply(wait: number) {
		const ticket = ++preview.ticket;
		await sleep(wait);

		if (ticket !== preview.ticket || !statement.key) return;

		const result = await previewStatement({
			handle,
			statement: statement.key,
			schema: { key: editor.key, content: editor.content },
		});
		if (ticket !== preview.ticket) return;

		preview.result = result;
	}

	async function show(result: Reply<{ key: string; grid: string[][] }> | undefined) {
		Object.assign(statement, { key: '', grid: [], errors: result?.errors ?? [] });
		if (result?.data) Object.assign(statement, { key: result.data.key, grid: result.data.grid });
		if (result?.data) await recognise(result.data.key);
		await apply(0);
	}

	// A statement no schema recognises keeps the schema being written.
	async function recognise(key: string) {
		const recognised = await recogniseStatement({ handle, statement: key });
		statement.errors = recognised.errors;
		if (recognised.data)
			Object.assign(editor, {
				key: recognised.data.key,
				content: recognised.data.content,
				errors: [],
				saved: false,
			});
	}

	function edit(content: string) {
		Object.assign(editor, { content, saved: false });
		void apply(300);
	}

	async function open(key: string) {
		const schema = await readSchema({ handle, key });
		Object.assign(editor, { errors: schema.errors, saved: false });
		if (schema.data) Object.assign(editor, { key, content: schema.data.content });
		await apply(0);
	}

	function start() {
		Object.assign(editor, { key: 'my-bank.yml', content: example, errors: [], saved: false });
		void apply(0);
	}

	async function save() {
		const saved = await saveSchema({ handle, key: editor.key, content: editor.content });
		Object.assign(editor, { errors: saved.errors, saved: saved.ok });
	}

	async function remove(key: string) {
		if (!confirm(`Delete ${key}?`)) return;
		const deleted = await deleteSchema({ handle, key });
		editor.errors = deleted.errors;
		if (!deleted.ok || key !== editor.key) return;

		Object.assign(editor, { key: '', content: '', saved: false });
		preview.result = null;
	}

	// One statement uploaded alone opens at once, even one read before.
	async function readSingle(uploaded: { key: string; queued: boolean }[]) {
		const single = uploaded.length === 1 ? uploaded[0] : undefined;
		if (single && !single.queued) await readStatement({ handle, statement: single.key }).then(show);
	}

	// Imports run as jobs; poll them until none is left to run, then list the files they made.
	$effect(() => {
		if (!running) return;

		const timer = setInterval(() => void listImports(handle).refresh(), 2000);
		return () => {
			clearInterval(timer);
			void listFiles(handle).refresh();
		};
	});
</script>

<PageHeader trail={[ledgerCrumb(data.ledger)]}>Import a statement</PageHeader>

<section>
	<h2>Schemas</h2>
	{#each schemas.errors as error, index (index)}
		<p role="alert">{detail(error)}</p>
	{/each}
	<ul>
		{#each schemas.data ?? [] as schema (schema.key)}
			<li>
				<button onclick={() => open(schema.key)}>{schema.key}</button>
				<button onclick={() => remove(schema.key)} aria-label="Delete {schema.key}">Delete</button>
			</li>
		{/each}
	</ul>
	<button onclick={start}>New schema</button>
</section>

<section>
	<h2>Statements</h2>
	<form
		enctype="multipart/form-data"
		{...uploadStatements.enhance(async (form) => {
			await form.submit();
			await readSingle(form.result?.data ?? []);
		})}
	>
		<input {...uploadStatements.fields.handle.as('hidden', handle)} />
		<label>
			Statements (.csv, .xls, .xlsx, .pdf, or ledger files)
			<input
				{...uploadStatements.fields.files.as('file multiple')}
				accept={UPLOAD_EXTENSIONS.join(',')}
				onchange={(e) => e.currentTarget.form?.requestSubmit()}
				required
			/>
		</label>
		<button disabled={uploadStatements.pending > 0}>Upload</button>
	</form>
	{#each uploadStatements.result?.errors ?? [] as error, index (index)}
		<p role="alert">{detail(error)}</p>
	{/each}

	<h3>To read</h3>
	{#each inbox.errors as error, index (index)}
		<p role="alert">{detail(error)}</p>
	{/each}
	<ul>
		{#each inbox.data ?? [] as row (row.key)}
			<li>
				<button onclick={() => readStatement({ handle, statement: row.key }).then(show)}>
					{row.key}
				</button>
			</li>
		{/each}
	</ul>

	<h3>Ledger files</h3>
	<ul>
		{#each imports.data ?? [] as job (job.id)}
			<li>
				{job.statement}: {job.status}
				{#if job.error}
					<span role="alert">{detail(job.error)}</span>
				{/if}
			</li>
		{/each}
	</ul>

	{#each statement.errors as error, index (index)}
		<p role="alert">{detail(error)}</p>
	{/each}

	{#if locked}
		<form
			{...unlockStatement.enhance(async (form) => {
				await form.submit();
				await show(form.result);
			})}
		>
			<input {...unlockStatement.fields.handle.as('hidden', handle)} />
			<input {...unlockStatement.fields.statement.as('hidden', locked)} />
			<label>
				Password for {locked}
				<input {...unlockStatement.fields.password.as('password')} autocomplete="off" required />
			</label>
			<button disabled={unlockStatement.pending > 0}>Unlock</button>
		</form>
	{/if}

	{#if statement.grid.length > 0}
		<div class="sheet">
			<table aria-label="Grid">
				<thead>
					<tr>
						<th></th>
						{#each columns as column (column)}
							<th>{column}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each statement.grid as row, index (index)}
						<tr>
							<th>{index + 1}</th>
							{#each columns as column, at (column)}
								<td>{row[at] ?? ''}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<section>
	<h2>Schema</h2>
	<label>
		Name
		<input bind:value={editor.key} required />
	</label>
	<label>
		Schema
		<textarea
			value={editor.content}
			oninput={(e) => edit(e.currentTarget.value)}
			rows="24"
			cols="80"
			spellcheck="false"></textarea>
	</label>
	<button onclick={save} disabled={saveSchema.pending > 0}>Save schema</button>

	{#if editor.saved}
		<p>Saved.</p>
	{/if}
	{#each editor.errors as error, index (index)}
		<p role="alert">{detail(error)}</p>
	{/each}
</section>

{#if statement.key}
	<section>
		<h2>Draft</h2>
		<form
			{...importStatement.enhance(async (form) => {
				await form.submit();
				const result = form.result;
				if (result?.ok && result.data) await goto(fileHref(handle, result.data.key));
			})}
		>
			<input {...importStatement.fields.handle.as('hidden', handle)} />
			<input {...importStatement.fields.statement.as('hidden', statement.key)} />
			<input {...importStatement.fields.schema.key.as('hidden', editor.key)} />
			<input {...importStatement.fields.schema.content.as('hidden', editor.content)} />
			{#if preview.result}
				{#each preview.result.errors as error, index (index)}
					<p role="alert">{detail(error)}</p>
				{/each}
				<p>{preview.result.data?.length ?? 0} transactions</p>
				<div class="sheet">
					<table aria-label="Draft">
						<thead>
							<tr><th>Line</th><th>Date</th><th>Description</th><th>Postings</th></tr>
						</thead>
						<tbody>
							{#each preview.result.data ?? [] as transaction (transaction.line)}
								<tr>
									<td>{transaction.line}</td>
									<td>{transaction.date} {transaction.time ?? ''}</td>
									<td>{transaction.description}</td>
									<td>
										{#each transaction.postings as posting, index (index)}
											<div>
												{posting.account}
												{posting.quantity}
											</div>
										{/each}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			{#each importStatement.fields.allIssues() ?? [] as issue (issue.message)}
				<p role="alert">{issue.message}</p>
			{/each}
			{#each importStatement.result?.errors ?? [] as error, index (index)}
				<p role="alert">{detail(error)}</p>
			{/each}
			<button disabled={importStatement.pending > 0}>Save</button>
		</form>
	</section>
{/if}

<style>
	.sheet {
		max-height: 60vh;
		overflow: auto;
		border: 1px solid var(--color-border);
	}

	.sheet table {
		border-collapse: collapse;
		font-family: var(--font-mono);
		font-size: var(--font-size-0);
	}

	.sheet th,
	.sheet td {
		padding: var(--size-0) var(--size-1);
		border: 1px solid var(--color-border);
		text-align: left;
		vertical-align: top;
	}

	.sheet td,
	.sheet thead th:not(:first-child) {
		width: 14ch;
		min-width: 14ch;
		max-width: 14ch;
		overflow-wrap: anywhere;
	}

	.sheet th {
		position: sticky;
		background: var(--color-subtle);
		font-weight: 400;
	}

	.sheet thead th {
		top: 0;
	}

	.sheet tbody th {
		left: 0;
		text-align: right;
	}

	.sheet thead th:first-child {
		left: 0;
		z-index: 1;
	}
</style>
