<script lang="ts">
	import FileGroups from '#lib/web/components/app-file-groups/app-file-groups.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';
	import { resolve } from '$app/paths';

	type Props = {
		handle: string;
		file: string;
		/** How many possible matches refinement found after the last save. */
		count: number;
		locked: boolean;
		onchanged: () => void;
	};

	const { handle, file, count, locked, onchanged }: Props = $props();
</script>

<Panel plain title="Matches" subtitle="Transactions of this file that may repeat others.">
	<a href={resolve(`/(signed-in)/l/[handle]/refine?file=${encodeURIComponent(file)}`, { handle })}>
		{count > 0 ? `${count} possible matches: review` : 'Find matches'}
	</a>
	<FileGroups {handle} {file} {locked} {onchanged} />
</Panel>
