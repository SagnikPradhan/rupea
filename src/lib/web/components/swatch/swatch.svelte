<script lang="ts">
	import { seriesOf } from '#lib/web/shared/chart.ts';

	/** Which part of a bar chart this stands for, in that part's shade. */
	const { part }: { part: number } = $props();
</script>

<span
	aria-hidden="true"
	style:background="var({seriesOf(part)})"
	style:border-color="var({seriesOf(part)}-edge)"
></span>

<style>
	span {
		display: inline-block;
		width: var(--size-2);
		height: var(--size-2);
		margin-right: var(--size-0);
		vertical-align: middle;
		border: 1px solid;
	}
</style>
