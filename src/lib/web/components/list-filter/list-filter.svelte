<script lang="ts">
	import type { Filter } from '#lib/shared/filter.ts';
	import RangePicker from '#lib/web/components/range-picker/range-picker.svelte';

	/** How long typing must pause before a description is searched for. */
	const PAUSE = 300;

	const { filter, accounts }: { filter: Filter; accounts: string[] } = $props();

	const typing = { timer: 0 };

	const submit = (event: Event & { currentTarget: HTMLInputElement }) =>
		event.currentTarget.form?.requestSubmit();

	function search(event: Event & { currentTarget: HTMLInputElement }) {
		const form = event.currentTarget.form;
		window.clearTimeout(typing.timer);
		typing.timer = window.setTimeout(() => form?.requestSubmit(), PAUSE);
	}
</script>

<form method="GET" data-sveltekit-keepfocus data-sveltekit-replacestate data-sveltekit-noscroll>
	<RangePicker current={filter.range} />
	<input type="hidden" name="range" value={filter.range} />
	<input
		name="account"
		list="accounts"
		value={filter.account}
		placeholder="Account"
		aria-label="Account"
		autocomplete="off"
		onchange={submit}
	/>
	<datalist id="accounts">
		{#each accounts as account (account)}<option value={account}></option>{/each}
	</datalist>
	<input
		type="search"
		name="description"
		value={filter.description}
		placeholder="Description"
		aria-label="Description"
		oninput={search}
	/>
</form>

<style>
	form {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-2);
		align-items: center;
	}

	input {
		flex: 1 1 var(--size-7);
		min-width: 0;
	}
</style>
