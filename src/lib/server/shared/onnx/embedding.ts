import type { Tokenizer } from '@huggingface/tokenizers';
import * as v from 'valibot';
import { safely } from '../control';
import { fault } from '../result/error';
import { err, ok, type Result } from '../result/result';
import type { ModelFile } from './download';

/** A model2vec static model, whose vector for a text is the mean of its tokens' rows. */
export type EmbeddingModel = { source: ModelFile; tokenizer: ModelFile };

/** A loaded model2vec model, with one row of size weights per token id. */
export type Model2vec = { tokenizer: Tokenizer; rows: Float32Array; size: number };

/**
 * A little-endian u64 header length, a JSON header, then the tensors.
 * https://huggingface.co/docs/safetensors/index#format
 */
const header = v.object({
	embeddings: v.object({
		dtype: v.literal('F32'),
		shape: v.tuple([v.number(), v.number()]),
		data_offsets: v.tuple([v.number(), v.number()]),
	}),
});

const notTable = fault('UnknownError', { message: 'Not a model2vec table' });

export const parseTable = (bytes: Uint8Array): Result<{ rows: Float32Array; size: number }> => {
	const length = bytes.byteLength < 8 ? 0 : Number(view(bytes).getBigUint64(0, true));
	const json = safely(() => JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + length))));
	const parsed = v.safeParse(header, json);
	if (!parsed.success) return err(notTable);

	const [rows, size] = parsed.output.embeddings.shape;
	const [start, end] = parsed.output.embeddings.data_offsets.map((o) => 8 + length + o);
	const data = bytes.slice(start, end);
	if (data.byteLength !== rows * size * 4) return err(notTable);

	return ok({ rows: new Float32Array(data.buffer), size });
};

export const vectors = (m: Model2vec, t: string[]): Float32Array[] =>
	t.map(encode(m.tokenizer)).map((i) => pool(m, i));

/** Token ids without the special ones or unknown tokens, which model2vec leaves out too. */
const encode = (tokenizer: Tokenizer) => (text: string) => {
	const unknown = tokenizer.token_to_id('[UNK]');
	return tokenizer.encode(text, { add_special_tokens: false }).ids.filter((id) => id !== unknown);
};

const pool = (model: Model2vec, ids: number[]): Float32Array => {
	const { rows, size } = model;

	const sum = Float32Array.from({ length: size }, (_, d) =>
		ids.reduce((s, id) => s + (rows[id * size + d] ?? 0), 0),
	);
	const length = Math.hypot(...sum) || 1;
	return sum.map((v) => v / length);
};

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
