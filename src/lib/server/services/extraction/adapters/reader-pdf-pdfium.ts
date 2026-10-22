import type { Box, Image } from '#lib/server/shared/onnx/runtime.ts';
import { safely } from '#lib/server/shared/control.ts';
import { fault } from '#lib/server/shared/result/error.ts';
import {
	attempt,
	err,
	ok,
	type Result,
	type ResultAsync,
} from '#lib/server/shared/result/result.ts';
import { init, type WrappedPdfiumModule } from '@embedpdf/pdfium';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { Word } from '../domain/table';

// FPDF_ERR_PASSWORD.
const PASSWORD = 4;
// FPDF_REMOVE_SECURITY.
const DECRYPTED = 3;

const WHITE = 0xffffffff;
const ANNOTATIONS = 0x01;

type Pdfium = WrappedPdfiumModule;

export type PdfPage = {
	/** The page in points, the space its words and rasters are measured in. */
	bounds: Box;
	words: Word[];
	raster: (region: Box, longest: number) => Image;
	close: () => void;
};

export type PdfDocument = {
	count: number;
	page: (index: number) => Result<PdfPage>;
	/** The document without its password. */
	decrypted: () => Result<Uint8Array>;
	close: () => void;
};

type OpenOptions = {
	name: string;
	content: Uint8Array;
	password?: string | undefined;
};

const wasm = createRequire(import.meta.url).resolve('@embedpdf/pdfium/pdfium.wasm');

// One instance for the process: pdfium holds no state of ours between documents.
const kept: { pdfium?: ResultAsync<Pdfium> } = {};

const start = () =>
	readFile(wasm)
		.then((b) => init({ wasmBinary: new Uint8Array(b).buffer }))
		.then((m) => {
			m.PDFiumExt_Init();
			return m;
		});

const pdfium = (): ResultAsync<Pdfium> => (kept.pdfium ??= attempt(start));

export const openPdf = (o: OpenOptions): ResultAsync<PdfDocument> =>
	pdfium().andThen((m) => open(m, o));

const open = (m: Pdfium, options: OpenOptions): Result<PdfDocument> => {
	const { name, content, password } = options;

	const data = copy(m, content);
	const document = m.FPDF_LoadMemDocument(data, content.length, password ?? '');
	const close = () => {
		if (document !== 0) m.FPDF_CloseDocument(document);
		m.pdfium.wasmExports.free(data);
	};

	if (document === 0) {
		close();
		return err(refusal(m, name));
	}

	return ok({
		count: m.FPDF_GetPageCount(document),
		page: (i) => load({ m, document, index: i, name }),
		decrypted: () => decrypted(m, document, name),
		close,
	});
};

const decrypted = (m: Pdfium, document: number, name: string): Result<Uint8Array> => {
	const writer = m.PDFiumExt_OpenFileWriter();
	const bytes = safely(() =>
		m.FPDF_SaveAsCopy(document, writer, DECRYPTED) ? written(m, writer) : undefined,
	);
	m.PDFiumExt_CloseFileWriter(writer);

	return bytes?.length
		? ok(bytes)
		: err(fault('CannotReadFile', { path: name, reason: 'not saved unlocked' }));
};

const written = (m: Pdfium, writer: number) => {
	const size = m.PDFiumExt_GetFileWriterSize(writer);
	const data = m.pdfium.wasmExports.malloc(size);
	m.PDFiumExt_GetFileWriterData(writer, data, size);
	const bytes = m.pdfium.HEAPU8.slice(data, data + size);

	m.pdfium.wasmExports.free(data);
	return bytes;
};

// Pdfium reads the document from this buffer as it goes, so it stays until close.
const copy = (m: Pdfium, content: Uint8Array) => {
	const pointer = m.pdfium.wasmExports.malloc(content.length);
	m.pdfium.HEAPU8.set(content, pointer);
	return pointer;
};

// Only meaningful while the load that failed is the last call pdfium made.
const refusal = (m: Pdfium, p: string) =>
	m.FPDF_GetLastError() === PASSWORD
		? fault('ExtractionLocked', { path: p })
		: fault('CannotReadFile', { path: p, reason: 'not a readable PDF' });

type LoadOptions = {
	m: Pdfium;
	document: number;
	index: number;
	name: string;
};

const load = (options: LoadOptions): Result<PdfPage> => {
	const { m, document, index, name } = options;

	const page = m.FPDF_LoadPage(document, index);
	if (page === 0)
		return err(fault('CannotReadFile', { path: name, reason: `page ${index + 1} does not open` }));

	const text = m.FPDFText_LoadPage(page);
	const height = m.FPDF_GetPageHeightF(page);

	return ok({
		bounds: { x1: 0, y1: 0, x2: m.FPDF_GetPageWidthF(page), y2: height },
		words: words(m, text, height),
		raster: (r, l) => raster({ m, page, region: r, longest: l }),
		close: () => {
			m.FPDFText_ClosePage(text);
			m.FPDF_ClosePage(page);
		},
	});
};

type RasterOptions = {
	m: Pdfium;
	page: number;
	region: Box;
	longest: number;
};

// Rendered at the size the model reads, so nothing is scaled twice.
const raster = (options: RasterOptions): Image => {
	const { m, page, region, longest } = options;

	const scale = longest / Math.max(region.x2 - region.x1, region.y2 - region.y1);
	const width = Math.max(1, Math.round((region.x2 - region.x1) * scale));
	const height = Math.max(1, Math.round((region.y2 - region.y1) * scale));

	const bitmap = m.FPDFBitmap_Create(width, height, 0);
	m.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, WHITE);

	const matrix = floats(m, [scale, 0, 0, scale, -region.x1 * scale, -region.y1 * scale]);
	const clip = floats(m, [0, 0, width, height]);
	m.FPDF_RenderPageBitmapWithMatrix(bitmap, page, matrix, clip, ANNOTATIONS);

	const image = {
		data: rgba({
			m,
			buffer: m.FPDFBitmap_GetBuffer(bitmap),
			stride: m.FPDFBitmap_GetStride(bitmap),
			width,
			height,
		}),
		width,
		height,
	};

	[matrix, clip].forEach((p) => m.pdfium.wasmExports.free(p));
	m.FPDFBitmap_Destroy(bitmap);
	return image;
};

const floats = (m: Pdfium, values: number[]) => {
	const pointer = m.pdfium.wasmExports.malloc(values.length * 4);
	values.forEach((v, i) => m.pdfium.setValue(pointer + i * 4, v, 'float'));
	return pointer;
};

type RgbaOptions = {
	m: Pdfium;
	buffer: number;
	stride: number;
	width: number;
	height: number;
};

// Pdfium writes rows of BGRx padded to its own stride; the models read RGBA.
const rgba = (options: RgbaOptions): Uint8Array => {
	const { m, buffer, stride, width, height } = options;
	const heap = m.pdfium.HEAPU8;
	const data = new Uint8Array(width * height * 4);

	const rows = Array.from({ length: height }, (_, y) => y);
	const columns = Array.from({ length: width }, (_, x) => x);
	rows.forEach((y) =>
		columns.forEach((x) => {
			const from = buffer + y * stride + x * 4;
			const to = (y * width + x) * 4;
			data[to] = heap[from + 2] ?? 0;
			data[to + 1] = heap[from + 1] ?? 0;
			data[to + 2] = heap[from] ?? 0;
			data[to + 3] = heap[from + 3] ?? 0;
		}),
	);

	return data;
};

type Character = { text: string; box: Box | undefined };

const words = (m: Pdfium, text: number, height: number): Word[] => {
	const characters = reading(m, text, height);
	const line = characters.map((c) => c.text).join('');

	return [...line.matchAll(/\S+/g)].flatMap((match) => {
		const boxes = characters
			.slice(match.index, match.index + match[0].length)
			.map((c) => c.box)
			.filter((b): b is Box => b !== undefined);
		if (boxes.length === 0) return [];

		return [
			{
				text: match[0],
				x1: Math.min(...boxes.map((b) => b.x1)),
				y1: Math.min(...boxes.map((b) => b.y1)),
				x2: Math.max(...boxes.map((b) => b.x2)),
				y2: Math.max(...boxes.map((b) => b.y2)),
			},
		];
	});
};

// One entry per code unit, so a word's text and its characters stay in step.
const reading = (m: Pdfium, text: number, height: number): Character[] => {
	const slot = m.pdfium.wasmExports.malloc(4 * 8);

	const characters = Array.from({ length: m.FPDFText_CountChars(text) }, (_, index) => {
		const unicode = character(m.FPDFText_GetUnicode(text, index));
		const box = extent({ m, text, index, slot, height });
		return unicode.split('').map((u) => ({ text: u, box }));
	}).flat();

	m.pdfium.wasmExports.free(slot);
	return characters;
};

// Pdfium reports no character for generated line breaks; they separate words.
const character = (u: number) => (u > 0 && u <= 0x10ffff ? String.fromCodePoint(u) : ' ');

type ExtentOptions = {
	m: Pdfium;
	text: number;
	index: number;
	slot: number;
	height: number;
};

// Boxes come in points from the bottom left; pages are read from the top left.
const extent = (options: ExtentOptions): Box | undefined => {
	const { m, text, index, slot, height } = options;

	const found = m.FPDFText_GetCharBox(text, index, slot, slot + 8, slot + 16, slot + 24);
	const [left = 0, right = 0, bottom = 0, top = 0] = [0, 1, 2, 3].map((k) =>
		m.pdfium.getValue(slot + k * 8, 'double'),
	);
	if (!found || right <= left) return undefined;

	return { x1: left, y1: height - top, x2: right, y2: height - bottom };
};
