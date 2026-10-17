<script lang="ts">
	import IconAlign from '@tabler/icons-svelte-runes/icons/align-box-center-middle-filled';
	import IconPlus from '@tabler/icons-svelte-runes/icons/circle-plus-filled';
	import IconSave from '@tabler/icons-svelte-runes/icons/device-floppy-filled';
	import IconRename from '@tabler/icons-svelte-runes/icons/file-pencil-filled';
	import IconTrash from '@tabler/icons-svelte-runes/icons/trash-filled';
	import type { Snippet } from 'svelte';
	import type { Editor } from '#lib/web/components/file-editor/file-editor.svelte.ts';
	import Button from '#lib/web/components/button/button.svelte';
	import CodeEditor from '#lib/web/components/code-editor/code-editor.svelte';
	import Field from '#lib/web/components/field/field.svelte';
	import IconButton from '#lib/web/components/icon-button/icon-button.svelte';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import { placesOf } from '#lib/web/errors.ts';

	type Props = {
		handle: string;
		editor: Editor;
		/** A line to show when the file opens, as `?line=` asks. */
		line: number | null;
		/** The editor now holds `key`, made or renamed here; the page should show it. */
		onopen: (key: string) => void;
		onremoved: () => void;
		/** Links shown at the end of the toolbar. */
		links?: Snippet;
	};

	const { handle, editor, line, onopen, onremoved, links }: Props = $props();
	const state = $derived(editor.state);

	type Step = 'editing' | 'creating' | 'renaming' | 'deleting';

	const step = $state({ now: 'editing' as Step, name: '' });

	const operation = $derived(state.errors.operation.filter((f) => f.type !== 'StorageConflict'));
	const problems = $derived(
		state.errors.parse.flatMap((e) =>
			placesOf(e)
				.filter((p) => p.file === state.file?.key && p.line !== null)
				.map((p) => Number(p.line)),
		),
	);

	const begin = (now: Step, name = '') => Object.assign(step, { now, name });

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (editor.dirty && !confirm('Discard your unsaved changes?')) return;

		const key = step.name.trim();
		if (await editor.create(key)) onopen(key);
		step.now = 'editing';
	}

	async function rename(event: SubmitEvent) {
		event.preventDefault();
		const to = step.name.trim();
		if (to !== state.file?.key && (await editor.rename(to))) onopen(to);
		step.now = 'editing';
	}

	async function remove() {
		if (await editor.remove()) onremoved();
		step.now = 'editing';
	}
</script>

<h1>
	{state.file?.key ?? 'Files'}
	{#if editor.dirty}<span class="tag">Unsaved</span>{/if}
</h1>

{#if state.conflict}
	<div class="conflict" role="alert">
		<p>This file changed on disk since you opened it.</p>
		<Button onclick={editor.reload}>Reload (discard mine)</Button>
		<Button onclick={editor.overwrite}>Overwrite</Button>
	</div>
{/if}

<Issues {handle} errors={[...operation, ...state.errors.parse]} />

{#if step.now === 'editing'}
	<div class="toolbar">
		{#if state.file}
			<Button primary icon={IconSave} onclick={editor.save} disabled={!editor.dirty || state.saving}
				>Save</Button
			>
			<IconButton label="Format" hint="Shift+Alt+F" icon={IconAlign} onclick={editor.format} />
			<IconButton
				label="Rename"
				icon={IconRename}
				onclick={() => begin('renaming', state.file?.key)}
			/>
			<IconButton label="Delete" icon={IconTrash} onclick={() => begin('deleting')} />
		{/if}
		<Button primary={!state.file} icon={IconPlus} onclick={() => begin('creating', 'new.rupee')}>
			New file
		</Button>
		<span>{@render links?.()}</span>
	</div>
{/if}

{#if step.now === 'creating'}
	<form class="toolbar" onsubmit={create}>
		<Field label="New file">
			<input bind:value={step.name} required />
		</Field>
		<Button primary>Create</Button>
		<Button type="button" onclick={() => begin('editing')}>Cancel</Button>
	</form>
{/if}

{#if step.now === 'renaming'}
	<form class="toolbar" onsubmit={rename}>
		<Field label="Rename to">
			<input bind:value={step.name} required />
		</Field>
		<Button primary>Rename</Button>
		<Button type="button" onclick={() => begin('editing')}>Cancel</Button>
	</form>
{/if}

{#if step.now === 'deleting'}
	<div class="toolbar" role="group" aria-label="Confirm delete">
		<p>Delete this file?</p>
		<Button primary onclick={remove}>Delete</Button>
		<Button onclick={() => begin('editing')}>Cancel</Button>
	</div>
{/if}

{#if state.file}
	<CodeEditor
		label="Ledger file"
		value={state.content}
		{problems}
		{line}
		onchange={editor.edit}
		onsave={() => void editor.save()}
		onformat={() => void editor.format()}
	/>
{:else}
	<p>Pick a file from the list, or make a new one.</p>
{/if}

<style>
	h1 {
		display: flex;
		gap: var(--size-2);
		align-items: baseline;
		overflow-wrap: anywhere;
	}

	.tag {
		color: var(--color-muted);
		font-size: var(--font-size-0);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-1);
		align-items: end;
		margin-block: var(--size-2);
	}

	div.toolbar {
		align-items: stretch;
	}

	form.toolbar > :global(:first-child) {
		flex: 1;
	}

	form.toolbar input {
		width: 100%;
	}

	.toolbar p {
		margin: 0 var(--size-1) 0 0;
		align-self: center;
	}

	.toolbar span {
		margin-left: auto;
		align-self: center;
	}

	.conflict {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-1);
		align-items: center;
		padding-left: var(--size-2);
		border-left: 2px solid var(--color-negative);
	}

	.conflict p {
		flex-basis: 100%;
		margin: 0 0 var(--size-1);
	}
</style>
