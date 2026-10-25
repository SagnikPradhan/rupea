<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Editor } from '#lib/web/components/file-editor/file-editor.svelte.ts';
	import Button from '#lib/web/components/button/button.svelte';
	import CodeEditor from '#lib/web/components/code-editor/code-editor.svelte';
	import Field from '#lib/web/components/field/field.svelte';
	import FilePath from '#lib/web/components/file-path/file-path.svelte';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import PageHeader from '#lib/web/components/page-header/page-header.svelte';
	import { placesOf } from '#lib/web/shared/errors.ts';
	import { isCounted } from '#lib/shared/folders.ts';

	type Props = {
		handle: string;
		trail: { href: string; label: string }[];
		editor: Editor;
		/** A line to show when the file opens, as `?line=` asks. */
		line: number | null;
		/** The editor now holds `key`, made or renamed here; the page should show it. */
		onopen: (key: string) => void;
		onremoved: () => void;
		/** Links shown at the end of the toolbar. */
		links?: Snippet;
	};

	const { handle, trail, editor, line, onopen, onremoved, links }: Props = $props();
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

<PageHeader {trail}>
	{#if state.file}<FilePath path={state.file.key} />{:else}Files{/if}
	{#if editor.dirty}<span class="tag">Unsaved</span>{/if}
	{#if state.file && !isCounted(state.file.key)}<span class="tag">Not counted</span>{/if}
	{#snippet actions()}
		{#if step.now === 'editing'}
			<div class="toolbar">
				{#if state.file}
					<Button
						primary={editor.dirty}
						onclick={editor.save}
						disabled={!editor.dirty || state.saving}
					>
						Save
					</Button>
					<Button title="Format (Shift+Alt+F)" onclick={editor.format}>Format</Button>
					<Button onclick={() => begin('renaming', state.file?.key)}>Rename</Button>
					<Button onclick={() => begin('deleting')}>Delete</Button>
				{:else}
					<Button primary onclick={() => begin('creating', 'new.rupea')}>New file</Button>
				{/if}
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
	{/snippet}
</PageHeader>

{#if state.conflict}
	<div class="conflict" role="alert">
		<p>This file changed on disk since you opened it.</p>
		<Button onclick={editor.reload}>Reload (discard mine)</Button>
		<Button onclick={editor.overwrite}>Overwrite</Button>
	</div>
{/if}

<Issues {handle} errors={[...operation, ...state.errors.parse]} />

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
{/if}

<style>
	.tag {
		color: var(--color-muted);
		font-size: var(--font-size-0);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-1);
		flex: 1;
		align-items: end;
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
