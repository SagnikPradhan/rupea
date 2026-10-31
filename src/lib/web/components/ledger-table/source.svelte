<script lang="ts">
	import { fileHref } from '#lib/web/shared/links.ts';

	const { handle, file, line }: { handle: string; file: string; line: number } = $props();
</script>

<td>
	<a
		href={fileHref(handle, file, line)}
		class="plain"
		aria-label="{file}:{line}"
		title="{file}:{line}"
	>
		{file.split('/').at(-1)}:{line}
	</a>
</td>

<style>
	td {
		color: var(--color-muted);
		font-size: var(--text-small);
		text-align: right;
		white-space: nowrap;
	}

	a {
		font-family: var(--font-mono);
	}

	@media (width < 40rem) {
		a {
			display: none;
		}
	}
</style>
