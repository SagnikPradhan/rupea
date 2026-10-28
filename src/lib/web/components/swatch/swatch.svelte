<script lang="ts">
	/** The colour token of the part this stands for, which has an edge token beside it. */
	const { shade }: { shade: string } = $props();
</script>

<span
	class="swatch"
	aria-hidden="true"
	style:background="var({shade})"
	style:border-color="var({shade}-edge)"
></span>
