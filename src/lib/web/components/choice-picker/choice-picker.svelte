<script lang="ts">
	import SegmentedControl from '#lib/web/components/segmented-control/segmented-control.svelte';
	import { hrefWith } from '#lib/web/shared/links.ts';
	import { page } from '$app/state';

	type Props = {
		/** The query parameter the choice is kept in. */
		param: string;
		label: string;
		/** Each value the parameter can take, and its name. */
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
