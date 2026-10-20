import type { ModelFile } from './download';

/** The length of the vectors `textEmbedding` makes. */
export const EMBEDDING_DIMENSIONS = 384;

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
	file: 'text-embedding.onnx',
	url: 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/751bff37182d3f1213fa05d7196b954e230abad9/onnx/model_quantized.onnx',
	sha256: 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1',
};

export const textTokenizer: ModelFile = {
	file: 'text-tokenizer.json',
	url: 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/751bff37182d3f1213fa05d7196b954e230abad9/tokenizer.json',
	sha256: 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0',
};

export const models = [tableDetection, tableStructure, textEmbedding, textTokenizer];
