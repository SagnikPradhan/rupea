<script lang="ts">
	import { listFiles } from '#lib/endpoints/files.remote.ts';
	import { listImports, listStatements, uploadStatements } from '#lib/endpoints/import.remote.ts';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import StatementList from '#lib/web/components/app-statement-list/app-statement-list.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import { UPLOAD_EXTENSIONS } from '@rupea/shared/files.ts';

	type Props = {
		handle: string;
		/** Called with the key of each file stored, once an upload is done. */
		onuploaded: (keys: string[]) => void;
	};

	const { handle, onuploaded }: Props = $props();

	const imports = $derived(await listImports(handle));
	const running = $derived(
		(imports.data ?? []).some((j) => j.status === 'queued' || j.status === 'running'),
	);

	const picker = $state({ input: null as HTMLInputElement | null, over: false });

	function drop(event: DragEvent) {
		event.preventDefault();
		picker.over = false;

		const files = event.dataTransfer?.files;
		if (!files?.length || !picker.input) return;

		picker.input.files = files;
		picker.input.form?.requestSubmit();
	}

	// Imports run as jobs; poll them until none is left to run, then list what they made.
	$effect(() => {
		if (!running) return;

		const timer = setInterval(() => void listImports(handle).refresh(), 2000);
		return () => {
			clearInterval(timer);
			void listFiles(handle).refresh();
			void listStatements(handle).refresh();
		};
	});
</script>

<Panel
	plain
	title="Import statements"
	subtitle="Bank, card and broker statements, or ledger files."
>
	<form
		enctype="multipart/form-data"
		{...uploadStatements.enhance(async (form) => {
			await form.submit();
			onuploaded(form.result?.data ?? []);
		})}
	>
		<input {...uploadStatements.fields.handle.as('hidden', handle)} />
		<input
			{...uploadStatements.fields.files.as('file multiple')}
			bind:this={picker.input}
			aria-label="Statements"
			accept={UPLOAD_EXTENSIONS.join(',')}
			onchange={(e) => e.currentTarget.form?.requestSubmit()}
			required
			hidden
		/>
		<button
			type="button"
			class={{ drop: true, over: picker.over }}
			disabled={uploadStatements.pending > 0}
			onclick={() => picker.input?.click()}
			ondragover={(e) => {
				e.preventDefault();
				picker.over = true;
			}}
			ondragleave={() => (picker.over = false)}
			ondrop={drop}
		>
			<strong>{uploadStatements.pending > 0 ? 'Uploading…' : 'Drop statements here'}</strong>
			<span>or click to choose files</span>
		</button>
	</form>

	<Issues {handle} errors={uploadStatements.result?.errors ?? []} />

	<StatementList {handle} />
</Panel>

<style>
	.drop {
		display: flex;
		width: 100%;
		padding: var(--size-4) var(--size-2);
		flex-direction: column;
		align-items: center;
		gap: var(--size-0);
		color: var(--color-ink);
		font: var(--text-base);
		background: none;
		border: var(--size-line-1) dashed var(--color-ink-3);
		border-radius: var(--radius-1);
		cursor: pointer;
	}

	.drop span {
		color: var(--color-muted);
	}

	.drop:hover,
	.over {
		background: var(--color-subtle);
		border-color: var(--color-ink);
	}

	.drop:disabled {
		cursor: progress;
	}
</style>
