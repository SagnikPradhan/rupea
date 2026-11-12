<script lang="ts">
	import { nameOf } from '#lib/web/shared/accounts.ts';
	import Calendar from '#lib/web/components/ui-chart-calendar/ui-chart-calendar.svelte';
	import Panel from '#lib/web/components/ui-panel/ui-panel.svelte';

	type Props = {
		daily: { day: number; amount: string }[];
		account: string;
	};

	const { daily, account }: Props = $props();

	const averages = $derived(
		daily.map((d) => ({ day: `2000-01-${String(d.day).padStart(2, '0')}`, total: d.amount })),
	);
</script>

<Panel title="Day of the month" subtitle="what {nameOf(account)} averaged on each day">
	<Calendar
		rows={averages}
		x="day"
		y="total"
		weekly={false}
		squircles
		label="Average spending on each day of the month, over the period"
	/>
</Panel>
