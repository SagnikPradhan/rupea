<script lang="ts">
	import { edgeOf } from '#lib/web/shared/chart.ts';

	/** How much of the colour shows, from 1 for all of it. */
	const { shade, tint = 1 }: { shade: string; tint?: number } = $props();
</script>

<span
	aria-hidden="true"
	style:opacity={tint}
	style:background="var({shade})"
	style:border-color="var({edgeOf(shade)})"
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
