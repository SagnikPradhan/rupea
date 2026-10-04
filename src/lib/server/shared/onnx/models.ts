/**
 * Every model file the server runs, at a pinned revision with its SHA-256.
 * The server downloads them into `RUPEE_MODELS_DIR` (see `download.ts`); the
 * adapters that run them point at their entries here.
 */
import type { ModelFile } from './download';

/** TATR table detection: where the tables on a page are. */
export const tableDetection: ModelFile = {
	file: 'table-detection.onnx',
	url: 'https://huggingface.co/Xenova/table-transformer-detection/resolve/187ac355617c8fee3d69c00d461ecf8eb8a4a5b7/onnx/model.onnx',
	sha256: '5be82ec9d157814ea8616588398d7baec17aed0780b870f7adf24b280ee1b5aa',
};

/** TATR table structure recognition: a table's rows, columns and headers. */
export const tableStructure: ModelFile = {
	file: 'table-structure.onnx',
	url: 'https://huggingface.co/Xenova/table-transformer-structure-recognition/resolve/5387550de655512721e1b88e4e42117001ba4813/onnx/model.onnx',
	sha256: '2c90a63298df61006a45267932f47b345a8b104ce53fd504eacf11aee3c05a41',
};

export const models = [tableDetection, tableStructure];
