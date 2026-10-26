<script lang="ts">
	/** The colour token of the part this stands for, which has an edge token beside it. */
	const { shade }: { shade: string } = $props();
</script>

<span aria-hidden="true" style:background="var({shade})" style:border-color="var({shade}-edge)"
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
