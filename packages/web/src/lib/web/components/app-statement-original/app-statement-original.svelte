<script lang="ts">
	import { readStatement } from '#lib/endpoints/import.remote.ts';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import Sheet from '#lib/web/components/app-statement-sheet/app-statement-sheet.svelte';
	import type { Reply } from '@rupea/shared/errors.ts';
	import { untrack } from 'svelte';

	type Props = { handle: string; statement: string };

	const { handle, statement }: Props = $props();

	const read = $state({ found: null as Reply<{ grid: string[][] }> | null });

	// Untracked: the command updates its own pending state, which would re-run this effect.
	$effect(() => {
		const key = statement;
		untrack(() => void load(key));
	});

	async function load(key: string) {
		read.found = await readStatement({ handle, statement: key });
	}
</script>

<Issues {handle} errors={read.found?.errors ?? []} detailed />

{#if read.found?.data}
	<Sheet grid={read.found.data.grid} />
{/if}
