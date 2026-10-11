import { tableDetection, tableStructure } from '#lib/server/shared/onnx/models.ts';
import type { Box, DetrModel, Models } from '#lib/server/shared/onnx/runtime.ts';
import type { Canvas } from '@napi-rs/canvas';

// As in TATR's reference inference.
const threshold = 0.5;

const detection: DetrModel = {
	source: tableDetection,
	longest: 800,
	labels: ['table', 'table rotated'],
	threshold,
};

const structure: DetrModel = {
	source: tableStructure,
	longest: 1000,
	labels: [
		'table',
		'table column',
		'table row',
		'table column header',
		'table projected row header',
		'table spanning cell',
	],
	threshold,
};

export const tatr = (models: Models) => ({
	detect: (c: Canvas, r: Box) => models.detect({ model: detection, canvas: c, region: r }),
	structure: (c: Canvas, r: Box) => models.detect({ model: structure, canvas: c, region: r }),
});

export type Tables = ReturnType<typeof tatr>;
