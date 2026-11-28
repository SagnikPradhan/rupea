<script lang="ts">
	import { findTransaction } from '#lib/endpoints/files.remote.ts';
	import Issues from '#lib/web/components/app-issues/app-issues.svelte';
	import TransactionForm from '#lib/web/components/app-transaction-form/app-transaction-form.svelte';
	import Aside from '#lib/web/components/ui-aside/ui-aside.svelte';

	type Props = {
		handle: string;
		file: string;
		line: number;
		onsaved: (line?: number) => void;
		onclose: () => void;
	};

	const { handle, file, line, onsaved, onclose }: Props = $props();

	const open = $derived(await findTransaction({ handle, file, line }));
</script>

<Aside title="Edit transaction" {onclose}>
	{#if open.data}
		{#key `${open.data.file}:${open.data.line}`}
			<TransactionForm {handle} keys={[]} newest={null} edit={open.data} {onsaved} />
		{/key}
	{/if}
	<Issues {handle} errors={open.errors} />
</Aside>
