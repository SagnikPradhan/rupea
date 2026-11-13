<script lang="ts">
	import { nameOf, prefixOf } from '#lib/web/shared/accounts.ts';

	type Props = {
		account: string;
		depth?: number;
		full?: boolean;
	};

	const { account, depth = 0, full = false }: Props = $props();
</script>

<span class="name" style:--depth={depth}
	><span class="prefix">{prefixOf(account, full)}</span>{nameOf(account)}</span
>

<style>
	.name {
		display: inline-block;
		padding-left: calc(var(--depth) * var(--size-2));
	}

	.prefix {
		color: var(--color-muted);
	}
</style>
