import * as v from 'valibot';

/** How a chart spaces its values: evenly, or by order of magnitude. */
export const Scale = v.picklist(['linear', 'log']);

export type Scale = v.InferOutput<typeof Scale>;

/** How the scale picker labels each scale. */
export const SCALE_LABELS: Record<Scale, string> = { linear: 'Linear', log: 'Log' };
