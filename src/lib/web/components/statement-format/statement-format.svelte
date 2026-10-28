<script lang="ts">
	import {
		deleteSchema,
		listSchemas,
		readSchema,
		saveSchema,
	} from '#lib/endpoints/schemas.remote.ts';
	import type { RupeaError } from '#lib/server/shared/result/error.ts';
	import Button from '#lib/web/components/button/button.svelte';
	import Field from '#lib/web/components/field/field.svelte';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import { formatColumn } from '#lib/web/shared/format.ts';

	/** A starting point: Rupea's built-in HDFC savings schema, which the manual walks through. */
	const EXAMPLE = `version: v1
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

	type Props = {
		handle: string;
		grid: string[][];
		/** The schema being written, which the statement is read with as it changes. */
		schema: { key: string; content: string };
		onchange: (schema: { key: string; content: string }) => void;
	};

	const { handle, grid, schema, onchange }: Props = $props();

	const schemas = $derived(await listSchemas(handle));
	const stored = $derived((schemas.data ?? []).some((s) => s.key === schema.key));
	const width = $derived(Math.max(0, ...grid.map((r) => r.length)));
	const columns = $derived([...Array(width).keys()].map(formatColumn));

	const state = $state({ saved: false, asking: false, errors: [] as RupeaError[] });

	function edit(changed: { key: string; content: string }) {
		state.saved = false;
		onchange(changed);
	}

	async function open(key: string) {
		const read = await readSchema({ handle, key });
		state.errors = read.errors;
		if (read.data) edit({ key, content: read.data.content });
	}

	async function save() {
		const saved = await saveSchema({ handle, key: schema.key, content: schema.content });
		Object.assign(state, { saved: saved.ok, errors: saved.errors });
	}

	async function remove() {
		const deleted = await deleteSchema({ handle, key: schema.key });
		Object.assign(state, { asking: false, errors: deleted.errors });
	}
</script>

<div class="setup">
	{#if grid.length > 0}
		<div class="sheet">
			<table aria-label="Statement">
				<thead>
					<tr>
						<th></th>
						{#each columns as column (column)}
							<th>{column}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each grid as row, index (index)}
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

	<div class="choices" role="group" aria-labelledby="start">
		<span id="start">Start from</span>
		{#each schemas.data ?? [] as saved (saved.key)}
			<button
				class="choice"
				aria-current={saved.key === schema.key ? 'true' : undefined}
				onclick={() => open(saved.key)}
			>
				{saved.key}
			</button>
		{/each}
		<button class="choice" onclick={() => edit({ key: 'my-bank.yml', content: EXAMPLE })}>
			The example
		</button>
	</div>

	<Field label="Name">
		<input value={schema.key} oninput={(e) => edit({ ...schema, key: e.currentTarget.value })} />
	</Field>

	<Field label="Schema">
		<textarea
			value={schema.content}
			oninput={(e) => edit({ ...schema, content: e.currentTarget.value })}
			rows="16"
			spellcheck="false"></textarea>
	</Field>

	{#if state.asking}
		<div class="toolbar" role="group" aria-label="Confirm delete">
			<p>Delete the schema {schema.key}?</p>
			<Button primary onclick={remove}>Delete</Button>
			<Button onclick={() => (state.asking = false)}>Cancel</Button>
		</div>
	{:else}
		<div class="toolbar">
			<Button onclick={save} disabled={saveSchema.pending > 0}>Save schema</Button>
			{#if stored}
				<Button aria-label="Delete {schema.key}" onclick={() => (state.asking = true)}>
					Delete
				</Button>
			{/if}
			{#if state.saved}<p role="status">Saved.</p>{/if}
		</div>
	{/if}
	<Issues {handle} errors={[...schemas.errors, ...state.errors]} detailed />
</div>

<style>
	.setup {
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-1) var(--size-2);
		align-items: end;
	}

	.toolbar p {
		align-self: center;
		margin: 0;
	}

	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-1) var(--size-3);
		align-items: baseline;
	}

	.choices span {
		color: var(--color-muted);
	}

	.choice {
		padding: 0;
		border: none;
		background: none;
		font: inherit;
	}

	.choice:hover {
		text-decoration: underline;
	}

	.choice[aria-current] {
		color: var(--color-accent);
		text-decoration: underline 2px;
		text-underline-offset: var(--size-0);
	}

	textarea {
		width: 100%;
		padding: var(--size-1) 0;
		border: none;
		border-top: 1px solid var(--color-ink);
		background: none;
		color: var(--color-ink);
		font-family: var(--font-mono);
		line-height: 1.5;
		resize: vertical;
	}

	textarea:focus-visible {
		outline: none;
		border-top-color: var(--color-accent);
	}

	.sheet {
		width: fit-content;
		max-width: 100%;
		max-height: 40vh;
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
