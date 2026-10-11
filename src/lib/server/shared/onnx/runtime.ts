import { Tokenizer } from '@huggingface/tokenizers';
import type { Canvas } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import type { Namespace } from '../logger';
import { attempt, concat, err, ok, okAsync, ResultAsync, type Result } from '../result';
import {
	detections,
	preprocess,
	type Box,
	type Detection,
	type DetrModel,
	type Output,
} from './detr';
import { ensure, prepare, type ModelFile, type ModelOptions } from './download';
import { batches, encode, inputs, vectors, type EmbeddingModel } from './embedding';

export type { Box, Detection, DetrModel, EmbeddingModel };

type DetectOptions = {
	model: DetrModel;
	canvas: Canvas;
	region: Box;
};

type EmbedOptions = {
	model: EmbeddingModel;
	texts: string[];
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

	const tokenizers = new Map<string, ResultAsync<Tokenizer>>();
	const tokenizer = (model: ModelFile) => {
		const loaded = tokenizers.get(model.file) ?? sure(model).andThen(loadTokenizer);
		tokenizers.set(model.file, loaded);
		return loaded;
	};
	return {
		detect: (o: DetectOptions): ResultAsync<Detection[]> =>
			session(o.model.source).andThen((l) => detr({ ...o, session: l })),
		embed: (o: EmbedOptions): ResultAsync<Float32Array[]> =>
			ResultAsync.combine([session(o.model.source), tokenizer(o.model.tokenizer)]).andThen(
				([l, t]) => embed({ ...o, session: l, tokenizer: t }),
			),
	};
};

export type Models = ReturnType<typeof createModels>;

type DetrOptions = DetectOptions & { session: InferenceSession };

const detr = (options: DetrOptions): ResultAsync<Detection[]> => {
	const { session, model, canvas, region } = options;
	const { longest, labels, threshold } = model;
	const pixels = preprocess({ canvas, region, longest });
	return attempt(() =>
		session.run({
			pixel_values: new Tensor('float32', pixels.data, [1, 3, pixels.height, pixels.width]),
		}),
	).andThen((o) =>
		output(o, 'logits').andThen((l) =>
			output(o, 'pred_boxes').map((b) =>
				detections({ logits: l, boxes: b, labels, threshold, region }),
			),
		),
	);
};

const loadTokenizer = (p: string): ResultAsync<Tokenizer> =>
	attempt(async () => new Tokenizer(JSON.parse(await readFile(p, 'utf8')), {}));

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
	return concat(batches(texts, model.batch).map((b) => () => run(b)));
};

const output = (values: InferenceSession.OnnxValueMapType, name: string): Result<Output> => {
	const value = values[name];
	if (!value)
		return err({ type: 'UnknownError', message: `The model returned no ${name}`, cause: [] });

	return ok({ dims: value.dims, data: value.data as Float32Array });
};
