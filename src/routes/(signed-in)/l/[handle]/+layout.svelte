<script lang="ts">
	const { data, children } = $props();
</script>

<!-- Pages keep what they made for one ledger, so another ledger starts them afresh. -->
{#key data.ledger.handle}
	{@render children()}
{/key}
