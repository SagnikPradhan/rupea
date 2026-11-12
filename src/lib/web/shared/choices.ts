import * as v from 'valibot';

/** What the choice of no account in particular is called. */
export const ALL_ACCOUNTS = 'All accounts';

/** How a chart spaces its values: evenly, or by order of magnitude. */
export const Scale = v.picklist(['linear', 'log']);

export type Scale = v.InferOutput<typeof Scale>;

/** How the scale picker labels each scale. */
export const SCALE_LABELS: Record<Scale, string> = { linear: 'Linear', log: 'Log' };

/** Whether a chart draws the period before beside the one picked. */
export const Compare = v.picklist(['with', 'without']);

export type Compare = v.InferOutput<typeof Compare>;

/** How the comparison picker labels each choice. */
export const COMPARE_LABELS: Record<Compare, string> = {
	with: 'Compare',
	without: 'Hide',
};
