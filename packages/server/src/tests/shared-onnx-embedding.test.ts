import type { Tokenizer } from '@huggingface/tokenizers';
import { describe, expect, it } from 'vitest';
import { parseTable, vectors } from '#lib/server/shared/onnx/embedding.ts';

// Token ids are digits, '?' is the unknown token, and specials wrap the text in brackets.
const digits = {
	token_to_id: (token: string) => (token === '[UNK]' ? 9 : undefined),
	encode: (text: string, options: { add_special_tokens: boolean }) => ({
		ids: [...(options.add_special_tokens ? `[${text}]` : text)].map((c) =>
			c === '?' ? 9 : Number(c),
		),
	}),
} as unknown as Tokenizer;

const safetensors = (meta: unknown, rows: number[]) => {
	const json = new TextEncoder().encode(JSON.stringify(meta));
	const bytes = new Uint8Array(8 + json.byteLength + rows.length * 4);
	new DataView(bytes.buffer).setBigUint64(0, BigInt(json.byteLength), true);
	bytes.set(json, 8);
	bytes.set(new Uint8Array(Float32Array.from(rows).buffer), 8 + json.byteLength);
	return bytes;
};

const embeddings = (shape: number[], bytes: number, dtype = 'F32') => ({
	embeddings: { dtype, shape, data_offsets: [0, bytes] },
});

describe('reading a table', () => {
	it('takes the rows after the header', () => {
		const table = parseTable(safetensors(embeddings([2, 3], 24), [1, 2, 3, 4, 5, 6]));
		expect(table._unsafeUnwrap()).toEqual({ rows: Float32Array.from([1, 2, 3, 4, 5, 6]), size: 3 });
	});

	it('refuses weights that are not float32', () => {
		expect(parseTable(safetensors(embeddings([1, 2], 8, 'F16'), [1, 2])).isErr()).toBe(true);
	});

	it('refuses rows that do not fill their shape', () => {
		expect(parseTable(safetensors(embeddings([2, 2], 8), [1, 2])).isErr()).toBe(true);
	});

	it('refuses bytes that are not safetensors', () => {
		expect(parseTable(new TextEncoder().encode('{}')).isErr()).toBe(true);
	});
});

describe('embedding texts', () => {
	const model = { tokenizer: digits, rows: Float32Array.from([3, 0, 3, 8, 0, 2]), size: 2 };

	it('averages the rows of the tokens, to unit length', () => {
		expect([...vectors(model, ['01'])[0]!]).toEqual([0.6, 0.8].map((v) => expect.closeTo(v)));
	});

	it('leaves out unknown tokens', () => {
		expect(vectors(model, ['2?'])).toEqual(vectors(model, ['2']));
	});

	it('leaves a text with no tokens at zero rather than dividing by it', () => {
		expect([...vectors(model, [''])[0]!]).toEqual([0, 0]);
	});
});
