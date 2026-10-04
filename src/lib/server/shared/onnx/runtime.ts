/**
 * ONNX Runtime, and the helpers for the models run on it: model files in a
 * directory, made sure of (see `download.ts`) and loaded on first use, kept
 * for the life of the `Models`, and DETR-style object detection over a region
 * of an image. In `download` mode every file is made sure of up front, so
 * downloads start with the server rather than with the first request that
 * needs them. What the labels mean is for the adapter that uses this.
 */
import { createCanvas, type Canvas, type ImageData } from '@napi-rs/canvas';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import type { Namespace } from '../logger';
import { attempt, err, ok, okAsync, type Result, type ResultAsync } from '../result';
import { ensure, prepare, type ModelFile, type ModelOptions } from './download';

/** A rectangle in pixels: left, top, right, bottom. */
export type Box = { x1: number; y1: number; x2: number; y2: number };

export type Detection = Box & { label: string; score: number };

/** A DETR object detection model: its file and how it reads an image. */
export type DetrModel = {
	source: ModelFile;
	/** Longest edge the model takes the image at. */
	longest: number;
	labels: string[];
	/** Keeps every detection scored at least this. */
	threshold: number;
};

// ImageNet normalisation, from the models' preprocessor config.
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

type DetectOptions = {
	model: DetrModel;
	canvas: Canvas;
	region: Box;
};

type CreateModelsOptions = Omit<ModelOptions, 'fetch'> &
	Partial<Pick<ModelOptions, 'fetch'>> & {
		directory: string;
		files: ModelFile[];
	};

export const createModels = (models: CreateModelsOptions) => {
	const { directory, files, mode, logger, fetch = globalThis.fetch } = models;
	const options = {
		mode,
		logger: logger.child({ namespace: 'onnx' satisfies Namespace }),
		fetch,
	};
	// A directory that cannot be readied fails each download on its own.
	const prepared =
		mode === 'download'
			? prepare(directory).orElse((error) => {
					options.logger.warn({ error }, 'models directory not readied');
					return okAsync(undefined);
				})
			: okAsync<void>(undefined);
	const ready = new Map<string, ResultAsync<string>>();
	const sure = (model: ModelFile) => {
		const path =
			ready.get(model.file) ?? prepared.andThen(() => ensure({ directory, model, ...options }));
		ready.set(model.file, path);
		return path;
	};
	if (mode === 'download') files.forEach(sure);

	const sessions = new Map<string, ResultAsync<InferenceSession>>();
	const session = (model: ModelFile) => {
		const loaded =
			sessions.get(model.file) ??
			sure(model).andThen((p) => attempt(() => InferenceSession.create(p)));
		sessions.set(model.file, loaded);
		return loaded;
	};
	return {
		/** The detections of `model` in `region` of `canvas`, in canvas pixels. */
		detect: (o: DetectOptions): ResultAsync<Detection[]> =>
			session(o.model.source).andThen((l) => detr({ ...o, session: l })),
	};
};

export type Models = ReturnType<typeof createModels>;

type DetrOptions = DetectOptions & { session: InferenceSession };

const detr = (options: DetrOptions): ResultAsync<Detection[]> => {
	const { session, model, canvas, region } = options;
	const { longest, labels, threshold } = model;
	return attempt(() =>
		session.run({
			pixel_values: tensor(crop({ canvas, region, longest })),
		}),
	).andThen((o) => detections({ outputs: o, labels, threshold, region }));
};

type CropOptions = {
	canvas: Canvas;
	region: Box;
	longest: number;
};

/** `region` of `canvas`, scaled so its longest edge is `longest`. */
const crop = (options: CropOptions): ImageData => {
	const { canvas, region, longest } = options;
	const width = region.x2 - region.x1;
	const height = region.y2 - region.y1;
	const scale = longest / Math.max(width, height);
	const input = createCanvas(
		Math.max(1, Math.round(width * scale)),
		Math.max(1, Math.round(height * scale)),
	);
	const context = input.getContext('2d');
	context.drawImage(canvas, region.x1, region.y1, width, height, 0, 0, input.width, input.height);
	return context.getImageData(0, 0, input.width, input.height);
};

/** The detections in a DETR model's `outputs` for `region`, in its pixels. */
type DetectionsOptions = {
	outputs: InferenceSession.OnnxValueMapType;
	labels: string[];
	threshold: number;
	region: Box;
};

const detections = (options: DetectionsOptions): Result<Detection[]> => {
	const { outputs, labels, threshold, region } = options;
	const width = region.x2 - region.x1;
	const height = region.y2 - region.y1;
	const logits = outputs['logits'];
	const boxes = outputs['pred_boxes'];
	if (!logits || !boxes)
		return err({
			type: 'UnknownError',
			message: 'The model returned no detections',
			cause: [],
		});

	const [, queries = 0, classes = 0] = logits.dims;
	const scores = logits.data as Float32Array;
	const centres = boxes.data as Float32Array;
	return ok(
		Array.from({ length: queries }, (_, q) => q).flatMap((query) => {
			const probabilities = softmax(scores.subarray(query * classes, (query + 1) * classes));
			// The last class is "no object".
			const score = Math.max(...probabilities.slice(0, -1));
			const label = labels[probabilities.indexOf(score)];
			if (label === undefined || score < threshold) return [];
			const [cx = 0, cy = 0, w = 0, h = 0] = centres.subarray(query * 4, query * 4 + 4);
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
		}),
	);
};

/** RGBA pixels as a normalised `[1, 3, height, width]` float tensor. */
const tensor = ({ data, width, height }: ImageData) => {
	const plane = width * height;
	const pixels = Float32Array.from({ length: 3 * plane }, (_, index) => {
		const channel = Math.floor(index / plane);
		const value = (data[(index % plane) * 4 + channel] ?? 0) / 255;
		return (value - (MEAN[channel] ?? 0)) / (STD[channel] ?? 1);
	});
	return new Tensor('float32', pixels, [1, 3, height, width]);
};

const softmax = (logits: Float32Array): number[] => {
	const max = Math.max(...logits);
	const exps = Array.from(logits, (l) => Math.exp(l - max));
	const sum = exps.reduce((a, b) => a + b, 0);
	return exps.map((e) => e / sum);
};
