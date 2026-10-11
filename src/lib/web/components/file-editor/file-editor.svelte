<script lang="ts">
	import type { RupeeError } from '#lib/server/shared/error.ts';
	import type { Editor } from '#lib/web/components/file-editor/file-editor.svelte.ts';

	type Props = {
		editor: Editor;
		/** The open file was renamed to `key`. */
		onrenamed: (key: string) => void;
		onremoved: () => void;
	};

	const { editor, onrenamed, onremoved }: Props = $props();
	const state = $derived(editor.state);

	const describe = (error: RupeeError) =>
		[
			error.type,
			'location' in error ? `at ${error.location}` : '',
			'reason' in error ? `: ${error.reason}` : '',
		].join(' ');

	async function rename() {
		const file = state.file;
		if (file === null) return;
		const to = prompt('Rename to', file.key);
		if (to === null || to === file.key) return;
		if (await editor.rename(to)) onrenamed(to);
	}

	async function remove() {
		const file = state.file;
		if (file === null || !confirm(`Delete ${file.key}?`)) return;
		if (await editor.remove()) onremoved();
	}
</script>

{#if state.file}
	<h2>{state.file.key}{editor.dirty ? ' *' : ''}</h2>

	{#if state.conflict}
		<div role="alert">
			<p>This file changed on disk since you opened it.</p>
			<button onclick={editor.reload}>Reload (discard mine)</button>
			<button onclick={editor.overwrite}>Overwrite</button>
		</div>
	{/if}

	{#each state.errors.operation.filter((f) => f.type !== 'StorageConflict') as failure, i (i)}
		<p role="alert">{describe(failure)}</p>
	{/each}

	<textarea
		aria-label="Ledger file"
		value={state.content}
		oninput={(e) => editor.edit(e.currentTarget.value)}
		rows="30"
		cols="90"
		spellcheck="false"
		style="font-family: monospace"></textarea>

	<p>
		<button onclick={editor.save} disabled={!editor.dirty || state.saving}>Save</button>
		<button onclick={rename}>Rename</button>
		<button onclick={remove}>Delete</button>
	</p>

	{#each state.errors.parse as error, i (i)}
		<p role="alert" style="color: crimson">{describe(error)}</p>
	{/each}
{:else}
	{#each state.errors.operation as failure, i (i)}
		<p role="alert">{describe(failure)}</p>
	{/each}
	<p>Select a file.</p>
{/if}
