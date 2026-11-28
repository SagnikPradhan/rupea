<script lang="ts">
	import { listFiles } from '#lib/endpoints/files.remote.ts';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import FileIndex from '#lib/web/components/app-file-index/app-file-index.svelte';
	import ImportPanel from '#lib/web/components/app-import-panel/app-import-panel.svelte';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import PageHeader from '#lib/web/components/ui-page-header/ui-page-header.svelte';
	import PanelGrid from '#lib/web/components/ui-panel-grid/ui-panel-grid.svelte';
	import { fileHref, statementHref } from '#lib/web/shared/links.ts';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import { isCounted } from '@rupea/shared/files.ts';
	import { countLabel } from '#lib/web/components/app-file-index/file-tree.ts';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';

	const { data } = $props();

	const handle = untrack(() => data.ledger.handle);

	const response = $derived(await listFiles(handle));

	const count = $derived((response.data ?? []).filter((f) => isCounted(f.key)).length);

	function uploadedTo(keys: string[]) {
		const first = keys[0];
		if (first !== undefined) void goto(statementHref(handle, first));
	}
</script>

<PageHeader subtitle="Your ledger’s files and the statements waiting to be imported.">
	Files
	{#snippet actions()}
		<Button primary href={fileHref(handle, 'new.rupea')}>New file</Button>
	{/snippet}
</PageHeader>

<Issues {handle} errors={response.errors} />

<PanelGrid spaced>
	<Panel plain title="Your files" subtitle={countLabel(count)}>
		<FileIndex {handle} />
	</Panel>

	<ImportPanel {handle} onuploaded={uploadedTo} />
</PanelGrid>
