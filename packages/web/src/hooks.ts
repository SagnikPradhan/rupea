import type { Transport } from '@sveltejs/kit/hooks';

export const transport: Transport = {
	PlainDate: {
		encode: (d) => d instanceof Temporal.PlainDate && d.toString(),
		decode: (d: string) => Temporal.PlainDate.from(d),
	},
};
