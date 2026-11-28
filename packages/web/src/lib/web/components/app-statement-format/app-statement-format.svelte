<script lang="ts">
	import {
		deleteSchema,
		listSchemas,
		readSchema,
		saveSchema,
	} from '#lib/endpoints/schemas.remote.ts';
	import type { RupeaError } from '@rupea/shared/errors.ts';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import Combobox from '#lib/web/components/ui-combobox/ui-combobox.svelte';
	import Field from '#lib/web/components/ui-field/ui-field.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';

	/**
	 * A starting point: Rupea's built-in HDFC savings schema, which the manual
	 * walks through.
	 */
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
		schema: { key: string; content: string };
		onchange: (schema: { key: string; content: string }) => void;
	};

	const { handle, schema, onchange }: Props = $props();

	const schemas = $derived(await listSchemas(handle));
	const stored = $derived((schemas.data ?? []).some((s) => s.key === schema.key));

	const state = $state({ saved: false, asking: false, errors: [] as RupeaError[] });

	function edit(changed: { key: string; content: string }) {
		state.saved = false;
		onchange(changed);
	}

	function rename(key: string) {
		if ((schemas.data ?? []).some((s) => s.key === key)) void open(key);
		if (!(schemas.data ?? []).some((s) => s.key === key)) edit({ ...schema, key });
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
	<Field label="Name">
		<Combobox
			value={schema.key}
			options={(schemas.data ?? []).map((s) => s.key)}
			onchange={rename}
		/>
	</Field>

	<div class="body">
		{#if schema.content === ''}
			<button class="choice" onclick={() => edit({ key: schema.key, content: EXAMPLE })}>
				Start from the example
			</button>
		{/if}

		<Field label="Schema">
			<textarea
				value={schema.content}
				oninput={(e) => edit({ ...schema, content: e.currentTarget.value })}
				rows="10"
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
</div>

<style>
	.setup {
		display: grid;
		min-width: 0;
		grid-row: span 2;
		grid-template-rows: subgrid;
		gap: var(--size-2);
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--size-1) var(--size-2);
	}

	.toolbar p {
		align-self: center;
	}

	.choice {
		padding: 0;
		align-self: start;
		color: var(--color-muted);
		font: inherit;
		background: none;
		border: none;
	}

	.choice:hover {
		text-decoration: underline;
	}

	textarea {
		width: 100%;
		padding: var(--size-1) 0;
		color: var(--color-ink);
		font-family: var(--font-mono);
		line-height: 1.5;
		background: none;
		border: none;
		border-top: var(--size-line-0) solid var(--color-border);
		resize: vertical;
	}

	textarea:focus-visible {
		border-top-color: var(--color-ink);
		outline: none;
	}
</style>
