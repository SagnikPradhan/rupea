import { textEmbedding, textTokenizer } from '#lib/server/shared/onnx/models.ts';
import type { EmbeddingModel, Models } from '#lib/server/shared/onnx/runtime.ts';

const potion: EmbeddingModel = { source: textEmbedding, tokenizer: textTokenizer };

/** Counts each change to how descriptions are cleaned, since the words embedded change with it. */
const CLEANING = 2;

// Stored with each vector, so vectors of another model or another cleaning are never mixed in.
export const MODEL = `${textEmbedding.sha256}-${CLEANING}`;

export const embedTexts = (m: Models, t: string[]) => m.embed({ model: potion, texts: t });
