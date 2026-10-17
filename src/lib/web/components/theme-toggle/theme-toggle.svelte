<script lang="ts">
	import IconContrast from '@tabler/icons-svelte-runes/icons/contrast-filled';
	import IconMoon from '@tabler/icons-svelte-runes/icons/moon-filled';
	import IconSun from '@tabler/icons-svelte-runes/icons/sun-filled';
	import { toggleTheme } from '#lib/endpoints/theme.remote.ts';
	import type { Theme } from '#lib/server/shared/theme.ts';
	import IconButton from '#lib/web/components/icon-button/icon-button.svelte';

	const { theme }: { theme: Theme } = $props();

	const ICONS = { system: IconContrast, light: IconSun, dark: IconMoon };

	const shown = $derived(toggleTheme.result ?? theme);

	// The server only sets the theme on the first render, so a toggle has to apply it here.
	$effect(() => {
		document.documentElement.dataset['theme'] = shown;
	});
</script>

<form {...toggleTheme.enhance(async ({ submit }) => void (await submit().updates()))}>
	<IconButton label="Theme: {shown}" icon={ICONS[shown]} />
</form>
