<script lang="ts">
	import Kpi from '#lib/web/components/ui-kpi/ui-kpi.svelte';
	import KpiStrip from '#lib/web/components/ui-kpi-strip/ui-kpi-strip.svelte';
	import { formatPercent, formatReturn, formatWhole } from '#lib/web/shared/format.ts';
	import { type Invested, groupsInvested, totalsOf } from '#lib/web/shared/invested.ts';

	type Props = { invested: Invested[] };

	const { invested }: Props = $props();

	const groups = $derived(groupsInvested(invested));
	const totals = $derived(totalsOf(groups));
	const count = $derived(`${groups.length} ${groups.length === 1 ? 'account' : 'accounts'}`);
</script>

<KpiStrip>
	<Kpi
		label="Invested value"
		figure={formatWhole(String(totals.value))}
		detail="on {formatWhole(String(totals.cost))} cost"
	/>
	<Kpi
		label="Gain"
		figure={formatWhole(String(totals.gain))}
		detail="{formatReturn(String(totals.gain), String(totals.cost)) ?? '0%'} on cost"
		tone={totals.gain > 0 ? 'positive' : totals.gain < 0 ? 'negative' : undefined}
	/>
	<Kpi
		label="Return a year"
		figure={totals.xirr === null ? '0%' : formatPercent(totals.xirr)}
		detail="weighted by value across {count}"
	/>
	<Kpi label="Put in" figure={formatWhole(String(totals.netIn))} detail="across {count}" />
</KpiStrip>
