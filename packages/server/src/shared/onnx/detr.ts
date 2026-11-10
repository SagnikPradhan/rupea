import type { ModelFile } from './download';

export type Box = { x1: number; y1: number; x2: number; y2: number };
export type Detection = Box & { label: string; score: number };

export type DetrModel = {
	source: ModelFile;
	longest: number;
	labels: string[];
	threshold: number;
};

export type Output = { dims: readonly number[]; data: Float32Array };
export type Pixels = { data: Float32Array; width: number; height: number };

/** Packed RGBA, four bytes a pixel, rows top to bottom. */
export type Image = { data: Uint8Array; width: number; height: number };

/** Pixels of a region, scaled so its longer side is `longest`. */
export type Raster = (region: Box, longest: number) => Image;

// ImageNet normalisation, from the models' preprocessor config.
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

// Channel-first planes.
export const preprocess = (image: Image): Pixels => {
	const plane = image.width * image.height;
	const data = Float32Array.from({ length: 3 * plane }, (_, index) => {
		const channel = Math.floor(index / plane);
		const value = (image.data[(index % plane) * 4 + channel] ?? 0) / 255;
		return (value - (MEAN[channel] ?? 0)) / (STD[channel] ?? 1);
	});
	return { data, width: image.width, height: image.height };
};

type DetectionsOptions = {
	logits: Output;
	boxes: Output;
	labels: string[];
	threshold: number;
	region: Box;
};

// Boxes come as relative centres and sizes; they go back to page coordinates.
export const detections = (options: DetectionsOptions): Detection[] => {
	const { logits, boxes, labels, threshold, region } = options;

	const width = region.x2 - region.x1;
	const height = region.y2 - region.y1;
	const [, queries = 0, classes = 0] = logits.dims;

	return Array.from({ length: queries }, (_, q) => q).flatMap((query) => {
		const probabilities = softmax(logits.data.subarray(query * classes, (query + 1) * classes));
		// The last class is "no object".
		const score = Math.max(...probabilities.slice(0, -1));
		const label = labels[probabilities.indexOf(score)];
		if (label === undefined || score < threshold) return [];

		const [cx = 0, cy = 0, w = 0, h = 0] = boxes.data.subarray(query * 4, query * 4 + 4);
		return [
			{
				label,
				score,
				x1: region.x1 + (cx - w / 2) * width,
				y1: region.y1 + (cy - h / 2) * height,
				x2: region.x1 + (cx + w / 2) * width,
				y2: region.y1 + (cy + h / 2) * height,
			},
		];
	});
};

const softmax = (logits: Float32Array): number[] => {
	const max = Math.max(...logits);
	const exps = Array.from(logits, (l) => Math.exp(l - max));
	const sum = exps.reduce((a, b) => a + b, 0);
	return exps.map((e) => e / sum);
};
