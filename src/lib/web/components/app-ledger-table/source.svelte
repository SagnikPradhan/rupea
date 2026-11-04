<script lang="ts">
	import { fileHref } from '#lib/web/shared/links.ts';

	const { handle, file, line }: { handle: string; file: string; line: number } = $props();
</script>

<td>
	<a href={fileHref(handle, file, line)} aria-label="{file}:{line}" title="{file}:{line}">
		{file.split('/').at(-1)}:{line}
	</a>
</td>

<style>
	td {
		color: var(--color-muted);
		font: var(--text-label);
		text-align: right;
		white-space: nowrap;
	}

	a {
		color: inherit;
		font-family: var(--font-mono);
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	@container (width < 48rem) {
		a {
			display: none;
		}
	}
</style>
