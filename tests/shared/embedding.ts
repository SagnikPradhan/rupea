import { fault } from '#lib/server/shared/result/error.ts';
import { errAsync, okAsync } from '#lib/server/shared/result/result.ts';
import type { Models } from '#lib/server/shared/onnx/runtime.ts';
import { EMBEDDING_DIMENSIONS } from '#lib/server/shared/onnx/models.ts';

const SIZE = EMBEDDING_DIMENSIONS;

const slot = (word: string) =>
	[...word].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % SIZE, 7);

export const hashVector = (text: string): Float32Array => {
	const counts = new Float32Array(SIZE);
	for (const word of text.split(/\s+/).filter((w) => w !== ''))
		counts[slot(word)] = (counts[slot(word)] ?? 0) + 1;
	const length = Math.hypot(...counts) || 1;
	return counts.map((c) => c / length);
};

const unavailable = () => errAsync(fault('UnknownError', { message: 'no such model' }));

export const hashed = (base: Models): Models => ({
	...base,
	embed: ({ texts }) => okAsync(texts.map(hashVector)),
});

export const broken = (base: Models): Models => ({ ...base, embed: unavailable });
