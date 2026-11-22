<script lang="ts">
	import { listFiles } from '#lib/endpoints/files.remote.ts';
	import FileIndex from '#lib/web/components/app-file-index/app-file-index.svelte';
	import ImportPanel from '#lib/web/components/app-import-panel/app-import-panel.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import { statementHref } from '#lib/web/shared/links.ts';
	import { listImports, listStatements } from '#lib/endpoints/import.remote.ts';
	import { isWaitingIn } from '#lib/web/shared/statements.ts';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';

	const { data } = $props();

	const handle = untrack(() => data.ledger.handle);

	const response = $derived(await listFiles(handle));

	const uploaded = $derived(await listStatements(handle));
	const imports = $derived(await listImports(handle));
	const waiting = $derived(isWaitingIn(uploaded.data ?? [], imports.data ?? []));

	function uploadedTo(keys: string[]) {
		const first = keys[0];
		if (first !== undefined) void goto(statementHref(handle, first));
	}
</script>

<PanelGrid wide={!waiting} full={waiting}>
	<div class="main">
		<PageHeader>Files</PageHeader>

		<Issues {handle} errors={response.errors} />

		<FileIndex {handle} />
	</div>

	<div class={{ side: true, waiting }}>
		<ImportPanel {handle} onuploaded={uploadedTo} />
	</div>
</PanelGrid>

<style>
	.main,
	.side {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
		min-width: 0;
	}

	.waiting {
		order: -1;
	}

	.side > :global(*) {
		align-self: stretch;
	}
</style>
