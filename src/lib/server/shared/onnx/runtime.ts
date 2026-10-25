import { Tokenizer } from '@huggingface/tokenizers';
import { readFile } from 'node:fs/promises';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import { chunks } from '../arrays';
import type { Logger, Namespace } from '../context/logger';
import { fault } from '../result/error';
import { attempt, err, ok, okAsync, type Result, ResultAsync, inOrder } from '../result/result';
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
import { encode, inputs, vectors, type EmbeddingModel } from './embedding';
import { remembering, type Embed } from './remembering';

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

// Vectors kept per embedding model, about 15 MB at 384 dimensions.
const REMEMBERED = 10_000;

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

	const tokenizers = new Map<string, ResultAsync<Tokenizer>>();
	const tokenizer = (m: ModelFile) =>
		remembered(tokenizers, m.file, () => sure(m).andThen(loadTokenizer));

	const embedders: Record<string, Embed> = {};
	const embedder = (model: EmbeddingModel) =>
		(embedders[model.source.file] ??= remembering(
			(x) =>
				ResultAsync.combine([session(model.source), tokenizer(model.tokenizer)]).andThen(([l, t]) =>
					embed({ model, texts: x, session: l, tokenizer: t }),
				),
			REMEMBERED,
		));

	return {
		ready: () => ResultAsync.combine(files.map(sure)).map(() => undefined),
		detect: (o) => session(o.model.source).andThen((l) => detr({ ...o, session: l })),
		embed: (o) => embedder(o.model)(o.texts),
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

const loadTokenizer = (p: string): ResultAsync<Tokenizer> =>
	attempt(() => readFile(p, 'utf8').then((t) => new Tokenizer(JSON.parse(t), {})));

type EmbedRunOptions = EmbedOptions & { session: InferenceSession; tokenizer: Tokenizer };

const embed = (options: EmbedRunOptions): ResultAsync<Float32Array[]> => {
	const { model, session, tokenizer, texts } = options;

	const run = (batch: string[]) => {
		const encoded = batch.map(encode(tokenizer, model.longest));
		const { ids, mask, shape } = inputs(encoded);

		return attempt(() =>
			session.run({
				input_ids: new Tensor('int64', ids, shape),
				attention_mask: new Tensor('int64', mask, shape),
				token_type_ids: new Tensor('int64', new BigInt64Array(ids.length), shape),
			}),
		).andThen((o) => output(o, 'last_hidden_state').map((h) => vectors(h, encoded)));
	};

	return inOrder(chunks(texts, model.batch).map((b) => () => run(b))).map((v) => v.flat());
};

const output = (values: InferenceSession.OnnxValueMapType, name: string): Result<Output> => {
	const value = values[name];
	if (!value) return err(fault('UnknownError', { message: `The model returned no ${name}` }));

	return ok({ dims: value.dims, data: value.data as Float32Array });
};
