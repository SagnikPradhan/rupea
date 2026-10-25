import { textEmbedding, textTokenizer } from '#lib/server/shared/onnx/models.ts';
import type { EmbeddingModel, Models } from '#lib/server/shared/onnx/runtime.ts';

const potion: EmbeddingModel = { source: textEmbedding, tokenizer: textTokenizer };

// Stored with each vector, so another model's vectors are never mixed in.
export const MODEL = textEmbedding.sha256;

export const embedTexts = (m: Models, t: string[]) => m.embed({ model: potion, texts: t });
