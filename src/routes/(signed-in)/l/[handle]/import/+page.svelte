<script lang="ts">
	import { createFile } from '#lib/endpoints/files.remote.ts';
	import { checkDraft, extractStatement } from '#lib/endpoints/import.remote.ts';
	import { getSuggestions } from '#lib/endpoints/refinement.remote.ts';
	import { getSchemas } from '#lib/endpoints/schemas.remote.ts';
	import type { RupeeError } from '#lib/server/shared/result/error.ts';
	import { goto } from '$app/navigation';

	type Checked = Awaited<ReturnType<typeof checkDraft>>;

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const schemas = $derived(await getSchemas());
	const draft = $state({
		key: '',
		content: '',
		errors: [] as RupeeError[],
		checked: null as Checked | null,
	});

	const describe = (error: RupeeError) =>
		[
			error.type,
			'location' in error ? `at ${error.location}` : '',
			'field' in error ? `(${error.field})` : '',
			'reason' in error ? `: ${error.reason}` : '',
			'columns' in error ? `: ${error.columns.join(', ')}` : '',
		].join(' ');

	async function check() {
		draft.checked = await checkDraft({
			key: draft.key,
			content: draft.content,
		});
	}

	async function save() {
		const saved = await createFile({ handle, key: draft.key, content: draft.content });
		draft.errors = saved.errors;
		if (!saved.ok) return;

		// Refinement runs on every save; review its matches if it found any.
		const found = await getSuggestions({ handle, file: draft.key });
		await goto(
			found.data?.length
				? `/l/${handle}/refine?file=${encodeURIComponent(draft.key)}`
				: `/l/${handle}/transactions`,
		);
	}
</script>

<h1>Import a statement</h1>

<form
	{...extractStatement.enhance(async (form) => {
		await form.submit();
		const result = form.result;
		Object.assign(draft, { errors: result?.errors ?? [], checked: null });
		if (result?.data) Object.assign(draft, result.data);
	})}
>
	<input {...extractStatement.fields.handle.as('hidden', handle)} />
	<label>
		Statement (.csv, .xlsx, .pdf)
		<input {...extractStatement.fields.file.as('file')} accept=".csv,.xlsx,.pdf" required />
	</label>
	<label>
		PDF password, if it has one
		<input {...extractStatement.fields.password.as('password')} autocomplete="off" />
	</label>
	<label>
		Schema
		<select {...extractStatement.fields.schema.as('select')} required>
			{#each schemas.data ?? [] as schema (schema.key)}
				<option value={schema.key}>{schema.key}</option>
			{/each}
		</select>
	</label>
	<label>
		Account
		<input {...extractStatement.fields.account.as('text')} placeholder="Assets:Bank" required />
	</label>
	{#each extractStatement.fields.allIssues() ?? [] as issue (issue.message)}
		<p role="alert">{issue.message}</p>
	{/each}
	<button disabled={extractStatement.pending > 0}>Read statement</button>
</form>

{#each draft.errors as error, index (index)}
	<p role="alert">{describe(error)}</p>
{/each}

{#if draft.key}
	<h2>Draft</h2>
	<label>
		Save as
		<input bind:value={draft.key} required />
	</label>
	<textarea bind:value={draft.content} rows="24" cols="80" spellcheck="false"></textarea>
	<p>
		<button onclick={check} disabled={checkDraft.pending > 0}>Check</button>
		<button onclick={save} disabled={createFile.pending > 0}>Save</button>
	</p>

	{#if draft.checked}
		{#each draft.checked.errors as error, index (index)}
			<p role="alert">{describe(error)}</p>
		{/each}
		<p>{draft.checked.data?.length ?? 0} transactions</p>
		<table>
			<thead>
				<tr><th>Date</th><th>Description</th><th>Postings</th><th>Line</th></tr>
			</thead>
			<tbody>
				{#each draft.checked.data ?? [] as transaction (transaction.line)}
					<tr>
						<td>{transaction.date} {transaction.time ?? ''}</td>
						<td>{transaction.description}</td>
						<td>
							{#each transaction.postings as posting, index (index)}
								<div>
									{posting.account}
									{posting.amount}{posting.price ? ` ${posting.price}` : ''}
								</div>
							{/each}
						</td>
						<td>{transaction.line}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
{/if}
