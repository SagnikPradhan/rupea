import { tableDetection, tableStructure } from '#lib/server/shared/onnx/models.ts';
import type { Box, DetrModel, Models, Raster } from '#lib/server/shared/onnx/runtime.ts';

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
	detect: (r: Raster, b: Box) => models.detect({ model: detection, raster: r, region: b }),
	structure: (r: Raster, b: Box) => models.detect({ model: structure, raster: r, region: b }),
});

export type Tables = ReturnType<typeof tatr>;
