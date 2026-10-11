import { withContext } from '#lib/server/shared/context.ts';
import { unknownError } from '#lib/server/shared/error.ts';
import type { Box } from '#lib/server/shared/onnx/runtime.ts';
import { attempt, concat, type ResultAsync } from '#lib/server/shared/result.ts';
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
	getDocument,
	Util,
	type PDFDocumentProxy,
	type PDFPageProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { toGrid, type Word } from '../domain/table';
import type { Grid } from '../domain/types';
import { tatr, type Tables } from './tatr';

// TATR works at ~1000 pixels. Text comes from the text layer, so scans read empty.
const SCALE = 2;

const PADDING = 10 * SCALE;

const pdfjs = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));

type PdfOptions = {
	name: string;
	content: Uint8Array;
	password?: string | undefined;
};

export const readPdf = (options: PdfOptions): ResultAsync<Grid> =>
	withContext('models')((models) =>
		open(options).andThen((dc) =>
			readPages(tatr(models), dc)
				.andTee(() => dc.loadingTask.destroy())
				.orTee(() => dc.loadingTask.destroy()),
		),
	);

const readPages = (tables: Tables, document: PDFDocumentProxy) =>
	concat(
		pages(document).map(
			(n) => () => attempt(() => document.getPage(n)).andThen((p) => readPage(tables, p)),
		),
	);

const pages = (d: PDFDocumentProxy) => Array.from({ length: d.numPages }, (_, i) => i + 1);

const open = ({ name, content, password }: PdfOptions): ResultAsync<PDFDocumentProxy> =>
	attempt({
		try: () =>
			getDocument({
				data: new Uint8Array(content),
				password,
				standardFontDataUrl: join(pdfjs, 'standard_fonts/'),
				cMapUrl: join(pdfjs, 'cmaps/'),
			}).promise,
		catch: (thrown) =>
			thrown instanceof Error && thrown.name === 'PasswordException'
				? { type: 'ExtractionPdfPassword', path: name, cause: [] }
				: {
						type: 'CannotReadFile',
						path: name,
						reason: 'not a readable PDF',
						cause: [unknownError(thrown)],
					},
	});

const render = (page: PDFPageProxy) =>
	attempt(async () => {
		const viewport = page.getViewport({ scale: SCALE });
		const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
		await page.render({
			canvas: canvas as unknown as HTMLCanvasElement,
			viewport,
		}).promise;
		return { canvas, words: words(await page.getTextContent(), viewport) };
	});

const readPage = (tables: Tables, page: PDFPageProxy): ResultAsync<Grid> =>
	render(page)
		.andThen(({ canvas, words }) =>
			tables.detect(canvas, bounds(canvas)).map((f) => ({ canvas, words, found: f })),
		)
		.andThen(({ canvas, words, found }) =>
			concat(
				found
					.filter(({ label }) => label === 'table')
					.sort((a, b) => a.y1 - b.y1)
					.map((t) => pad(t, canvas))
					.map(
						(region) => () =>
							tables.structure(canvas, region).map((structure) =>
								toGrid(
									structure,
									words.filter((w) => contains(region, w)),
								),
							),
					),
			),
		);

const words = (
	{ items }: { items: unknown[] },
	viewport: ReturnType<PDFPageProxy['getViewport']>,
): Word[] =>
	items.filter(isTextItem).flatMap((item) => {
		const [, , c = 0, d = 0, x = 0, baseline = 0] = Util.transform(
			viewport.transform,
			item.transform,
		);
		const height = Math.hypot(c, d);
		const width = item.width * viewport.scale;
		const length = item.str.length;
		return [...item.str.matchAll(/\S+/g)].map((match) => ({
			text: match[0],
			x1: x + (width * match.index) / length,
			x2: x + (width * (match.index + match[0].length)) / length,
			y1: baseline - height,
			y2: baseline,
		}));
	});

const isTextItem = (i: unknown): i is TextItem => typeof i === 'object' && i !== null && 'str' in i;

const bounds = (canvas: Canvas): Box => ({
	x1: 0,
	y1: 0,
	x2: canvas.width,
	y2: canvas.height,
});

const pad = (box: Box, canvas: Canvas): Box => ({
	x1: Math.max(0, box.x1 - PADDING),
	y1: Math.max(0, box.y1 - PADDING),
	x2: Math.min(canvas.width, box.x2 + PADDING),
	y2: Math.min(canvas.height, box.y2 + PADDING),
});

const contains = (box: Box, word: Word) => {
	const x = (word.x1 + word.x2) / 2;
	const y = (word.y1 + word.y2) / 2;
	return x >= box.x1 && x <= box.x2 && y >= box.y1 && y <= box.y2;
};
