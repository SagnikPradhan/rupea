<script lang="ts">
	import { fileHref } from '#lib/web/shared/links.ts';

	type Props = {
		handle: string;
		file: string;
		line: number;
		/** Sits in its own column between the text and the amounts, instead of under an amount. */
		column?: boolean;
	};

	const { handle, file, line, column = false }: Props = $props();
</script>

<td class:column class:optional={column}>
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

	td.column {
		width: 25%;
		text-align: left;
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
