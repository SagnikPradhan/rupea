<script lang="ts">
	import { fileHref } from '#lib/web/links.ts';

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
		font-size: var(--font-size-0);
		text-align: right;
		white-space: nowrap;
	}

	a {
		color: inherit;
		text-decoration: none;
		font-family: var(--font-mono);
	}

	a:hover {
		text-decoration: underline;
	}

	@media (width < 40rem) {
		a {
			display: none;
		}
	}
</style>
