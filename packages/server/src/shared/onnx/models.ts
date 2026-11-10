import type { ModelFile } from './download';

/** The length of the vectors `textEmbedding` makes. */
export const EMBEDDING_DIMENSIONS = 256;

export const tableDetection: ModelFile = {
	file: 'table-detection.onnx',
	url: 'https://huggingface.co/Xenova/table-transformer-detection/resolve/187ac355617c8fee3d69c00d461ecf8eb8a4a5b7/onnx/model.onnx',
	sha256: '5be82ec9d157814ea8616588398d7baec17aed0780b870f7adf24b280ee1b5aa',
};

export const tableStructure: ModelFile = {
	file: 'table-structure.onnx',
	url: 'https://huggingface.co/Xenova/table-transformer-structure-recognition/resolve/5387550de655512721e1b88e4e42117001ba4813/onnx/model.onnx',
	sha256: '2c90a63298df61006a45267932f47b345a8b104ce53fd504eacf11aee3c05a41',
};

export const textEmbedding: ModelFile = {
	file: 'text-embedding.safetensors',
	url: 'https://huggingface.co/minishlab/potion-base-8M/resolve/bf8b056651a2c21b8d2565580b8569da283cab23/model.safetensors',
	sha256: 'f65d0f325faadc1e121c319e2faa41170d3fa07d8c89abd48ca5358d9a223de2',
};

export const textTokenizer: ModelFile = {
	file: 'text-tokenizer.json',
	url: 'https://huggingface.co/minishlab/potion-base-8M/resolve/bf8b056651a2c21b8d2565580b8569da283cab23/tokenizer.json',
	sha256: 'e67e803f624fb4d67dea1c730d06e1067e1b14d830e2c2202569e3ef0f70bb50',
};

export const models = [tableDetection, tableStructure, textEmbedding, textTokenizer];
