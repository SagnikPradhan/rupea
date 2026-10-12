<script lang="ts">
	import { getSchema, getSchemas, saveSchema } from '#lib/endpoints/schemas.remote.ts';
	import type { RupeeError } from '#lib/server/shared/result/error.ts';

	/** A starting point: a statement with separate debit and credit columns. */
	const example = `version: v1
name: My bank
header:
  text: Narration
records:
  each: row
  where:
    col: Date
    matches: '^\\d{2}/\\d{2}/\\d{2}$'
fields:
  date:
    from: [header: Date]
    pipe: [date: dd/MM/yy]
  description:
    from: [header: Narration]
    pipe: [trim]
  amount:
    - from: [header: Withdrawal Amt.]
      pipe: [number, negate]
    - from: [header: Deposit Amt.]
      pipe: [number]
`;

	const response = $derived(await getSchemas());
	const editor = $state({
		key: 'my-bank.yml',
		content: example,
		errors: [] as RupeeError[],
		saved: false,
	});

	async function edit(key: string) {
		const schema = await getSchema(key);
		Object.assign(editor, { errors: schema.errors, saved: false });
		if (schema.data) Object.assign(editor, { key, content: schema.data.content });
	}

	async function save() {
		const saved = await saveSchema({
			key: editor.key,
			content: editor.content,
		});
		Object.assign(editor, { errors: saved.errors, saved: saved.ok });
	}
</script>

<h1>Statement schemas</h1>
<p><a href="/">Ledgers</a></p>

{#each response.errors as error, index (index)}
	<p role="alert">{error.type}</p>
{/each}

<ul>
	{#each response.data ?? [] as schema (schema.key)}
		<li><button onclick={() => edit(schema.key)}>{schema.key}</button></li>
	{/each}
</ul>

<label>
	Name
	<input bind:value={editor.key} required />
</label>
<label>
	Schema
	<textarea bind:value={editor.content} rows="24" cols="80" spellcheck="false"></textarea>
</label>
<button onclick={save} disabled={saveSchema.pending > 0}>Save</button>

{#if editor.saved}
	<p>Saved.</p>
{/if}
{#each editor.errors as error, index (index)}
	<p role="alert">
		{error.type}{'reason' in error ? `: ${error.reason}` : ''}
	</p>
{/each}
