<script lang="ts">
	import { ICONS } from '#lib/web/shared/icons.ts';
	import { toggleTheme } from '#lib/endpoints/theme.remote.ts';
	import type { Theme } from '#lib/web/shared/theme.ts';
	import IconButton from '#lib/web/components/ui-button-icon/ui-button-icon.svelte';

	const { theme }: { theme: Theme } = $props();

	const shown = $derived(toggleTheme.result ?? theme);

	// The server only sets the theme on the first render, so a toggle has to apply it here.
	$effect(() => {
		document.documentElement.dataset['theme'] = shown;
	});
</script>

<form {...toggleTheme.enhance(async ({ submit }) => void (await submit().updates()))}>
	<IconButton label="Theme: {shown}" icon={ICONS[shown]} outlined />
</form>
