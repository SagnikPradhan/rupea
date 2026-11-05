<script lang="ts">
	import { findTransaction, findTransactionFiles } from '#lib/endpoints/files.remote.ts';
	import TransactionForm from '#lib/web/components/app-transaction-form/app-transaction-form.svelte';
	import Aside from '#lib/web/components/ui-aside/ui-aside.svelte';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { MediaQuery } from 'svelte/reactivity';

	type Props = {
		handle: string;
		/** Reloads the list beside the aside after a transaction is written. */
		refresh: () => Promise<void>;
	};

	const { handle, refresh }: Props = $props();

	const wide = new MediaQuery('min-width: 90rem');
	const editing = $derived(page.url.searchParams.get('edit'));
	const adding = $derived(page.url.searchParams.has('add') || (wide.current && !editing));
	const files = $derived(adding ? await findTransactionFiles(handle) : null);
	const open = $derived(editing ? await findTransaction({ handle, id: editing }) : null);
	const closed = $derived(hrefWith(page.url.searchParams, { add: '', edit: '' }));

	const saved = async () => {
		await refresh();
		if (editing) await goto(closed);
	};
</script>

{#if files?.data}
	<Aside title="Add transaction" closeBeside={false} onclose={() => goto(closed)}>
		<TransactionForm {handle} keys={files.data.keys} newest={files.data.newest} onsaved={saved} />
	</Aside>
{:else if editing && open?.data}
	<Aside title="Edit transaction" onclose={() => goto(closed)}>
		{#key `${editing}:${open.data.version}`}
			<TransactionForm {handle} keys={[]} newest={null} edit={open.data} onsaved={saved} />
		{/key}
	</Aside>
{/if}
