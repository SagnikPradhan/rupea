<script lang="ts">
	const {
		title = 'Coming soon',
		page = false,
	}: {
		title?: string;
		/** Fills the page below its header, for a page with nothing else on it. */
		page?: boolean;
	} = $props();
</script>

<div class:page>
	<p class="text-title">{title}</p>
	<p class="text-label">Needs data Rupea does not read yet</p>
</div>

<style>
	div {
		display: flex;
		flex-direction: column;
		gap: var(--size-0);
		align-items: center;
		justify-content: center;
		padding: var(--size-3);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius);
		text-align: center;
	}

	.page {
		min-height: calc(100dvh - var(--size-5) * 2);
	}

	p {
		margin: 0;
	}

	.text-label {
		color: var(--color-muted);
	}
</style>
