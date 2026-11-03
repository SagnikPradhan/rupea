<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		label: string;
		children: Snippet;
	};

	const { label, children }: Props = $props();
</script>

<div class="picker">
	<span>{label}</span>
	{@render children()}
</div>
