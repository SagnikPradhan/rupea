import * as v from 'valibot';

/** How a chart spaces its values: evenly, or by order of magnitude. */
export const Scale = v.picklist(['linear', 'log']);

export type Scale = v.InferOutput<typeof Scale>;

/** How the scale picker labels each scale. */
export const SCALE_LABELS: Record<Scale, string> = { linear: 'Linear', log: 'Log' };

/** What a chart of spending shows: its buckets over time, or how it divides by account. */
export const Chart = v.picklist(['time', 'flow']);

export type Chart = v.InferOutput<typeof Chart>;

export const CHART_LABELS: Record<Chart, string> = { time: 'Over time', flow: 'By account' };

/** Net worth shows how it divides as a treemap of what is held. */
export const WORTH_CHART_LABELS: Record<Chart, string> = { time: 'Over time', flow: 'Treemap' };
