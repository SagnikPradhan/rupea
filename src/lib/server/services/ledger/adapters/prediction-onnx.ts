import { textEmbedding, textTokenizer } from '#lib/server/shared/onnx/models.ts';
import type { EmbeddingModel, Models } from '#lib/server/shared/onnx/runtime.ts';

const minilm: EmbeddingModel = {
	source: textEmbedding,
	tokenizer: textTokenizer,
	// Statement descriptions are short; 128 tokens is the model's training length.
	longest: 128,
	batch: 32,
};

// Stored with each vector, so another model's vectors are never mixed in.
export const MODEL = textEmbedding.sha256;

export const embedTexts = (m: Models, t: string[]) => m.embed({ model: minilm, texts: t });
