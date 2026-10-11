import type { Tokenizer } from '@huggingface/tokenizers';
import { describe, expect, it } from 'vitest';
import type { Output } from '#lib/server/shared/onnx/detr.ts';
import { encode, inputs, vectors } from '#lib/server/shared/onnx/embedding.ts';

// One token per character, so lengths are easy to read.
const characters = {
	encode: (text: string) => ({
		ids: [...text].map((c) => c.charCodeAt(0)),
		attention_mask: [...text].map(() => 1),
	}),
} as unknown as Tokenizer;

const hidden = (rows: number[][][]): Output => ({
	dims: [rows.length, rows[0]?.length ?? 0, rows[0]?.[0]?.length ?? 0],
	data: Float32Array.from(rows.flat(2)),
});

describe('encoding a text', () => {
	it('truncates to the longest the model takes', () => {
		expect(encode(characters, 3)('abcdef')).toEqual({ ids: [97, 98, 99], mask: [1, 1, 1] });
	});

	it('leaves a short text alone', () => {
		expect(encode(characters, 128)('ab')).toEqual({ ids: [97, 98], mask: [1, 1] });
	});
});

describe('building inputs', () => {
	it('pads every row with zeros to the longest in the batch', () => {
		const built = inputs([
			{ ids: [5, 6, 7], mask: [1, 1, 1] },
			{ ids: [8], mask: [1] },
		]);
		expect(built.shape).toEqual([2, 3]);
		expect([...built.ids]).toEqual([5n, 6n, 7n, 8n, 0n, 0n]);
		expect([...built.mask]).toEqual([1n, 1n, 1n, 1n, 0n, 0n]);
	});
});

describe('pooling hidden states', () => {
	it('averages the unmasked tokens of each row, to unit length', () => {
		const pooled = vectors(
			hidden([
				[
					[3, 0],
					[3, 8],
				],
				[
					[0, 2],
					[100, 100],
				],
			]),
			[
				{ ids: [1, 2], mask: [1, 1] },
				{ ids: [1], mask: [1, 0] },
			],
		);
		expect([...pooled[0]!]).toEqual([0.6, 0.8].map((v) => expect.closeTo(v)));
		expect([...pooled[1]!]).toEqual([0, 1]);
	});

	it('leaves an all-zero state at zero rather than dividing by it', () => {
		const pooled = vectors(hidden([[[0, 0]]]), [{ ids: [1], mask: [1] }]);
		expect([...pooled[0]!]).toEqual([0, 0]);
	});
});
