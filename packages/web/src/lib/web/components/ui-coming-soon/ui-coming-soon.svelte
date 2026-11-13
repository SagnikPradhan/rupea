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
		flex-direction: column;
		gap: var(--size-0);
		align-items: center;
		justify-content: center;
		padding: var(--size-3);
		border: var(--size-line-0) dashed var(--color-border);
		border-radius: var(--radius-1);
		text-align: center;
	}

	.page {
		min-height: calc(100dvh - var(--size-5) * 2);
	}

	.title {
		font: var(--text-title);
	}

	.note {
		font: var(--text-label);
		color: var(--color-muted);
	}
</style>
