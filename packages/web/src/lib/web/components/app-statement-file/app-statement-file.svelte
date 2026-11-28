<script lang="ts">
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import { originalHref } from '#lib/web/shared/links.ts';
	import { isShowable } from '#lib/web/shared/statements.ts';

	type Props = { handle: string; statement: string };

	const { handle, statement }: Props = $props();

	const href = $derived(originalHref(handle, statement));
</script>

{#if isShowable(statement)}
	<iframe title="Original statement" src={href}></iframe>
{:else}
	<div class="download">
		<p>This kind of file can’t be shown here.</p>
		<div><Button {href}>Download original</Button></div>
	</div>
{/if}

<style>
	iframe {
		width: 100%;
		height: var(--size-height-3);
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--radius-1);
	}

	.download {
		display: flex;
		flex-direction: column;
		gap: var(--size-2);
	}

	p {
		margin: 0;
		color: var(--color-muted);
	}
</style>
