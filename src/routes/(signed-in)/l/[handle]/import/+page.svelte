<script lang="ts">
	import { listImports, listStatements, uploadStatements } from '#lib/endpoints/import.remote.ts';
	import { listFiles } from '#lib/endpoints/files.remote.ts';
	import Button from '#lib/web/components/button/button.svelte';
	import FilePath from '#lib/web/components/file-path/file-path.svelte';
	import Issues from '#lib/web/components/issues/issues.svelte';
	import PageHeader from '#lib/web/components/page-header/page-header.svelte';
	import StatementList from '#lib/web/components/statement-list/statement-list.svelte';
	import StatementView from '#lib/web/components/statement-view/statement-view.svelte';
	import { ledgerCrumb } from '#lib/web/shared/links.ts';
	import { UPLOAD_EXTENSIONS } from '#lib/shared/statements.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const statement = $derived(page.url.searchParams.get('statement'));
	const imports = $derived(await listImports(handle));
	const running = $derived(
		(imports.data ?? []).some((j) => j.status === 'queued' || j.status === 'running'),
	);
	const trail = $derived(
		statement === null
			? [ledgerCrumb(data.ledger)]
			: [ledgerCrumb(data.ledger), { href: page.url.pathname, label: 'Import' }],
	);

	const picker = $state({ input: null as HTMLInputElement | null });

	// One statement uploaded alone opens at once.
	async function openSingle(uploads: { key: string; queued: boolean }[]) {
		const single = uploads.length === 1 ? uploads[0] : undefined;
		if (single) await goto(`?statement=${encodeURIComponent(single.key)}`);
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

<PageHeader {trail}>
	{#if statement === null}Import{:else}<FilePath path={statement} />{/if}
	{#snippet actions()}
		{#if statement === null}
			<form
				enctype="multipart/form-data"
				{...uploadStatements.enhance(async (form) => {
					await form.submit();
					await openSingle(form.result?.data ?? []);
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
				<Button
					type="button"
					primary
					disabled={uploadStatements.pending > 0}
					onclick={() => picker.input?.click()}
				>
					{uploadStatements.pending > 0 ? 'Uploading…' : 'Upload statements'}
				</Button>
			</form>
		{/if}
	{/snippet}
</PageHeader>

<Issues {handle} errors={uploadStatements.result?.errors ?? []} />

{#if statement === null}
	<StatementList {handle} />
{:else}
	<StatementView {handle} {statement} />
{/if}
