import * as v from 'valibot';

/** How a chart spaces its values: evenly, or by order of magnitude. */
export const Scale = v.picklist(['linear', 'log']);

export type Scale = v.InferOutput<typeof Scale>;

/** How the scale picker labels each scale. */
export const SCALE_LABELS: Record<Scale, string> = { linear: 'Linear', log: 'Log' };

/** What a chart of net worth shows: its days over time, or what is held as a treemap. */
export const WorthChart = v.picklist(['time', 'treemap']);

export type WorthChart = v.InferOutput<typeof WorthChart>;

export const WORTH_CHART_LABELS: Record<WorthChart, string> = {
	time: 'Over time',
	treemap: 'Treemap',
};
