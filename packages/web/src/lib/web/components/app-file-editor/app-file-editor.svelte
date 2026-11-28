<script lang="ts">
	import { ICONS } from '#lib/web/shared/icons.ts';
	import type { Snippet } from 'svelte';
	import type { Editor } from '#lib/web/components/app-file-editor/app-file-editor.svelte.ts';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import CodeEditor from '#lib/web/components/ui-code-editor/ui-code-editor.svelte';
	import Field from '#lib/web/components/ui-field/ui-field.svelte';
	import FilePath from '#lib/web/components/ui-file-path/ui-file-path.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import SegmentedControl from '#lib/web/components/ui-segmented-control/ui-segmented-control.svelte';
	import Tag from '#lib/web/components/ui-tag/ui-tag.svelte';
	import { placesOf } from '#lib/web/shared/errors.ts';
	import { ledger } from '#lib/web/shared/ledger-syntax.ts';
	import type { ResolvedPathname } from '$app/types';

	type Props = {
		handle: string;
		editor: Editor;
		line: number | null;
		onopen: (key: string) => void;
		onremoved: () => void;
		/** What a file under review ends with, such as adding it to the ledger. */
		footer?: Snippet | undefined;
		/** What a file under review shows between the header and the views. */
		below?: Snippet | undefined;
		/** False when something else points at the file's name. */
		renamable?: boolean;
		/** What the header calls the file when its key is not its name. */
		named?: string | undefined;
		/**
		 * The file as text or as a list of its transactions, and the switch between
		 * them.
		 */
		view?: {
			chosen: 'file' | 'ui' | 'grid' | 'original';
			segments: { name: string; chosen: boolean; href: ResolvedPathname }[];
		};
		/** The list of the file's transactions, shown in the UI view. */
		ui?: Snippet;
		/** The statement the file was made from as a grid, shown in the grid view. */
		grid?: Snippet;
		/**
		 * The statement the file was made from as uploaded, shown in the original
		 * view.
		 */
		original?: Snippet;
		/** The steps a statement is going through, shown in the header. */
		progress?: Snippet;
	};

	const {
		handle,
		editor,
		line,
		onopen,
		onremoved,
		footer,
		below,
		renamable = true,
		named,
		view,
		ui,
		grid,
		original,
		progress,
	}: Props = $props();
	const state = $derived(editor.state);
	const texting = $derived((view?.chosen ?? 'file') === 'file');

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

<PageHeader {progress}>
	Files
	{#if editor.dirty}<Tag>Unsaved</Tag>{/if}
	{#snippet subtitle()}
		{#if state.file}
			<FilePath path={named ?? state.file.key} />
		{/if}
	{/snippet}
	{#snippet actions()}
		{#if step.now === 'editing'}
			<div class="toolbar">
				{#if state.file}
					<Button href="/l/{handle}/files">All files</Button>
					{#if texting}
						<Button
							primary={editor.dirty}
							icon={ICONS.check}
							onclick={editor.save}
							disabled={!editor.dirty || state.saving}
						>
							Save
						</Button>
						<Button title="Format (Shift+Alt+F)" onclick={editor.format}>Format</Button>
					{/if}
					{#if renamable}
						<Button icon={ICONS.edit} onclick={() => begin('renaming', state.file?.key)}>
							Rename
						</Button>
					{/if}
					<Button icon={ICONS.delete} onclick={() => begin('deleting')}>Delete</Button>
				{:else}
					<Button primary icon={ICONS.add} onclick={() => begin('creating', 'new.rupea')}>
						New file
					</Button>
				{/if}
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

{@render below?.()}

{#if state.file && view}
	<div class="views"><SegmentedControl label="View" segments={view.segments} /></div>
{/if}

<Issues {handle} errors={[...operation, ...state.errors.parse]} />

{#if state.file && view?.chosen === 'ui'}
	{@render ui?.()}
{/if}
{#if state.file && view?.chosen === 'grid'}
	{@render grid?.()}
{/if}
{#if state.file && view?.chosen === 'original'}
	{@render original?.()}
{/if}
{#if state.file && texting}
	<CodeEditor
		label="Ledger file"
		value={state.content}
		language={ledger}
		{problems}
		{line}
		onchange={editor.edit}
		onsave={() => void editor.save()}
		onformat={() => void editor.format()}
	/>
{/if}

{@render footer?.()}

<style>
	.toolbar {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--size-1);
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

	.views {
		display: flex;
	}

	.conflict {
		display: flex;
		padding-left: var(--size-2);
		flex-wrap: wrap;
		align-items: center;
		gap: var(--size-1);
		border-left: var(--size-line-1) solid var(--color-negative);
	}

	.conflict p {
		margin: 0 0 var(--size-1);
		flex-basis: 100%;
	}
</style>
