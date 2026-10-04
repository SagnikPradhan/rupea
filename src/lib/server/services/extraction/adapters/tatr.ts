/**
 * Outbound adapter that finds tables in page images and their rows and
 * columns, with Microsoft's Table Transformer (TATR) models. Two DETR models
 * run on the shared ONNX Runtime: one detects tables on a page, the other
 * recognises a table's structure. The server downloads them (see
 * `shared/onnx/models.ts`).
 */
import { tableDetection, tableStructure } from '#lib/server/shared/onnx/models.ts';
import type { Box, DetrModel, Models } from '#lib/server/shared/onnx/runtime.ts';
import type { Canvas } from '@napi-rs/canvas';

/** TATR's reference inference keeps everything scored at least this. */
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
	/** The tables in `region` of `canvas`, in canvas pixels. */
	detect: (c: Canvas, r: Box) => models.detect({ model: detection, canvas: c, region: r }),
	/** The rows, columns and the like of the table in `region`. */
	structure: (c: Canvas, r: Box) => models.detect({ model: structure, canvas: c, region: r }),
});

export type Tables = ReturnType<typeof tatr>;
