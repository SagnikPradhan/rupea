<script lang="ts">
	const {
		title = 'Coming soon',
		page = false,
	}: {
		title?: string;
		page?: boolean;
	} = $props();
</script>

<div class:page>
	<p class="title">{title}</p>
	<p class="note">Needs data Rupea does not read yet</p>
</div>

<style>
	div {
		display: flex;
		padding: var(--size-3);
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--size-0);
		text-align: center;
		border: var(--size-line-0) dashed var(--color-border);
		border-radius: var(--radius-1);
	}

	.page {
		min-height: calc(100dvh - var(--size-5) * 2);
	}

	.title {
		font: var(--text-title);
	}

	.note {
		color: var(--color-muted);
		font: var(--text-label);
	}
</style>
