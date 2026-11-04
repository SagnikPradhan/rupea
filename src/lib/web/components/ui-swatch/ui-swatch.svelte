<script lang="ts">
	import { edgeOf } from '#lib/web/shared/chart.ts';

	const { shade }: { shade: string } = $props();
</script>

<span aria-hidden="true" style:background="var({shade})" style:border-color="var({edgeOf(shade)})"
></span>

<style>
	span {
		display: inline-block;
		width: var(--size-2);
		height: var(--size-2);
		margin-right: var(--size-0);
		vertical-align: middle;
		border: var(--size-line-0) solid;
	}
</style>
