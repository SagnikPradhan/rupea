import type { Tokenizer } from '@huggingface/tokenizers';
import type { ModelFile } from './download';
import type { Output } from './detr';

export type EmbeddingModel = {
	source: ModelFile;
	tokenizer: ModelFile;
	longest: number;
	batch: number;
};

export type Encoded = { ids: number[]; mask: number[] };

export type Inputs = { ids: BigInt64Array; mask: BigInt64Array; shape: [number, number] };

export const encode = (tokenizer: Tokenizer, longest: number) => (text: string) => {
	const encoded = tokenizer.encode(text);
	return {
		ids: encoded.ids.slice(0, longest),
		mask: encoded.attention_mask.slice(0, longest),
	};
};

// Rows are zero-padded to the longest in the batch.
export const inputs = (encoded: Encoded[]): Inputs => {
	const width = Math.max(...encoded.map((e) => e.ids.length));
	const pad = (v: number[]) => Array.from({ length: width }, (_, i) => BigInt(v[i] ?? 0));
	return {
		ids: BigInt64Array.from(encoded.flatMap((e) => pad(e.ids))),
		mask: BigInt64Array.from(encoded.flatMap((e) => pad(e.mask))),
		shape: [encoded.length, width],
	};
};

// Mean of the unmasked token states, normalised to unit length.
export const vectors = (hidden: Output, encoded: Encoded[]): Float32Array[] => {
	const [, width = 0, size = 0] = hidden.dims;
	return encoded.map((e, r) =>
		pool({ hidden: hidden.data, offset: r * width * size, mask: e.mask, size }),
	);
};

type PoolOptions = {
	hidden: Float32Array;
	offset: number;
	mask: number[];
	size: number;
};

const pool = (options: PoolOptions): Float32Array => {
	const { hidden, offset, mask, size } = options;
	const tokens = mask.filter((m) => m === 1).length || 1;
	const mean = Float32Array.from({ length: size }, (_, d) =>
		mask.reduce((s, m, t) => s + m * (hidden[offset + t * size + d] ?? 0), 0),
	).map((v) => v / tokens);
	const length = Math.hypot(...mean) || 1;
	return mean.map((v) => v / length);
};
