import type { ConditionalSchemaConverter } from '@orpc/openapi';
import type { GenericSchema } from 'valibot';
import { experimental_ValibotToJsonSchemaConverter as Valibot } from '@orpc/valibot';

const BINARY = {
	type: 'string',
	format: 'binary',
	contentMediaType: 'application/octet-stream',
} as const;

/**
 * The valibot converter of the API library, taught to name the common schemas
 * of the document, which it ignores, and to describe a file as binary. A schema
 * that refers to itself, such as the error, cannot be written out otherwise.
 */
export const converter: ConditionalSchemaConverter = {
	condition: (s) => new Valibot().condition(s),

	convert: (s, options) => {
		const components = options.components ?? [];
		const definitions = Object.fromEntries(components.map((c) => [c.ref, c.schema])) as Record<
			string,
			GenericSchema
		>;
		const valibot = new Valibot({
			definitions,
			overrideRef: ({ referenceId }) => referenceId,
			overrideSchema: ({ valibotSchema }) => (valibotSchema.type === 'file' ? BINARY : undefined),
		});
		const [required, { $defs, ...json }] = valibot.convert(s, options);
		const own = components.find((c) => c.schema === s);
		const inline = own && options.minStructureDepthForRef;

		return [required, inline ? ($defs?.[own.ref] ?? json) : json];
	},
};
