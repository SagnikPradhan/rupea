<script lang="ts">
	import SegmentedControl from '#lib/web/components/ui-segmented-control/ui-segmented-control.svelte';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { page } from '$app/state';

	type Props = {
		param: string;
		label: string;
		choices: Record<string, string>;
		current: string;
	};

	const { param, label, choices, current }: Props = $props();

	const segments = $derived(
		Object.entries(choices).map(([value, name]) => ({
			name,
			href: hrefWith(page.url.searchParams, { [param]: value }),
			chosen: value === current,
		})),
	);
</script>

<SegmentedControl fill {label} {segments} />
