<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & { primary?: boolean };

	const { primary = false, children, ...rest }: Props = $props();
</script>

<button class:primary {...rest}>
	{@render children?.()}
</button>
