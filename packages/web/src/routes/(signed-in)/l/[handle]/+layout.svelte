<script lang="ts">
	import { BASE } from '#lib/web/shared/format.ts';
	import { setContext } from 'svelte';

	const { data, children } = $props();

	setContext(BASE, () => data.ledger.base);
</script>

<!-- Pages keep what they made for one ledger, so another ledger or base starts them afresh. -->
{#key `${data.ledger.handle} ${data.ledger.base}`}
	{@render children()}
{/key}
