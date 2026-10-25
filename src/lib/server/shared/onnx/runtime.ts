import { Tokenizer } from '@huggingface/tokenizers';
import { readFile } from 'node:fs/promises';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import type { Logger, Namespace } from '../context/logger';
import { fault } from '../result/error';
import { attempt, err, ok, okAsync, type Result, ResultAsync } from '../result/result';
import {
	detections,
	preprocess,
	type Box,
	type Detection,
	type DetrModel,
	type Image,
	type Output,
	type Raster,
} from './detr';
import { ensure, prepare, type ModelFile, type ModelMode } from './download';
import { parseTable, vectors, type EmbeddingModel, type Model2vec } from './embedding';

export type { Box, Detection, DetrModel, EmbeddingModel, Image, Raster };

type DetectOptions = {
	model: DetrModel;
	raster: Raster;
	region: Box;
};

type EmbedOptions = {
	model: EmbeddingModel;
	texts: string[];
};

type CreateModelsOptions = {
	directory: string;
	files: ModelFile[];
	threads: number;
	mode: ModelMode;
	logger: Logger;
	fetch?: typeof globalThis.fetch;
};

/** The models Rupea runs on its own. */
export type Models = {
	/** Settles once every model is downloaded and checked. */
	ready: () => ResultAsync<void>;
	detect: (options: DetectOptions) => ResultAsync<Detection[]>;
	embed: (options: EmbedOptions) => ResultAsync<Float32Array[]>;
};

/** Loads each model on first use. */
export const createModels = (models: CreateModelsOptions): Models => {
	const { directory, files, threads, mode, logger, fetch = globalThis.fetch } = models;
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

	const paths = new Map<string, ResultAsync<string>>();
	const sure = (m: ModelFile) =>
		remembered(paths, m.file, () =>
			prepared.andThen(() => ensure({ directory, model: m, ...options })),
		);
	if (mode === 'download') files.forEach(sure);

	const sessions = new Map<string, ResultAsync<InferenceSession>>();
	const session = (model: ModelFile) =>
		remembered(sessions, model.file, () =>
			sure(model).andThen((p) =>
				attempt(() => InferenceSession.create(p, { intraOpNumThreads: threads })),
			),
		);

	const model2vecs = new Map<string, ResultAsync<Model2vec>>();
	const model2vec = (m: EmbeddingModel) =>
		remembered(model2vecs, m.source.file, () =>
			ResultAsync.combine([sure(m.source), sure(m.tokenizer)]).andThen(loadModel2vec),
		);

	return {
		ready: () => ResultAsync.combine(files.map(sure)).map(() => undefined),
		detect: (o) => session(o.model.source).andThen((l) => detr({ ...o, session: l })),
		embed: (o) => model2vec(o.model).map((m) => vectors(m, o.texts)),
	};
};

/** Loads once per key; a failed load is forgotten, so the next use tries again. */
const remembered = <T>(
	m: Map<string, ResultAsync<T>>,
	key: string,
	load: () => ResultAsync<T>,
): ResultAsync<T> => {
	const kept = m.get(key) ?? load().orTee(() => m.delete(key));
	m.set(key, kept);
	return kept;
};

type DetrOptions = DetectOptions & { session: InferenceSession };

const detr = (options: DetrOptions): ResultAsync<Detection[]> => {
	const { session, model, raster, region } = options;
	const { longest, labels, threshold } = model;

	const run = () => {
		const pixels = preprocess(raster(region, longest));
		return session.run({
			pixel_values: new Tensor('float32', pixels.data, [1, 3, pixels.height, pixels.width]),
		});
	};

	return attempt(run).andThen((o) =>
		output(o, 'logits').andThen((l) =>
			output(o, 'pred_boxes').map((b) =>
				detections({ logits: l, boxes: b, labels, threshold, region }),
			),
		),
	);
};

const loadModel2vec = ([source, tokenizer]: [string, string]): ResultAsync<Model2vec> =>
	ResultAsync.combine([loadTable(source), loadTokenizer(tokenizer)]).map(([t, k]) => ({
		...t,
		tokenizer: k,
	}));

const loadTable = (p: string) => attempt(() => readFile(p)).andThen(parseTable);

const loadTokenizer = (p: string): ResultAsync<Tokenizer> =>
	attempt(() => readFile(p, 'utf8').then((t) => new Tokenizer(JSON.parse(t), {})));

const output = (values: InferenceSession.OnnxValueMapType, name: string): Result<Output> => {
	const value = values[name];
	if (!value) return err(fault('UnknownError', { message: `The model returned no ${name}` }));

	return ok({ dims: value.dims, data: value.data as Float32Array });
};
