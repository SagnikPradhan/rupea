import { withContext } from '#lib/server/shared/context.ts';
import type { Box } from '#lib/server/shared/onnx/runtime.ts';
import { sequence, type ResultAsync } from '#lib/server/shared/result/result.ts';
import { toGrid, type Word } from '../domain/table';
import type { Grid } from '../domain/types';
import { openPdf, type PdfDocument, type PdfPage } from './pdfium';
import { tatr, type Tables } from './tatr';

// Points, so a table's edge rules sit inside the region TATR reads.
const PADDING = 10;

type PdfOptions = {
	name: string;
	content: Uint8Array;
	password?: string | undefined;
};

// Words come from the text layer, so scans read empty.
export const readPdf = (o: PdfOptions): ResultAsync<Grid> =>
	withContext('models')((m) =>
		openPdf(o).andThen((d) => readPages(tatr(m), d).andTee(d.close).orTee(d.close)),
	);

export const unlockPdf = (o: PdfOptions): ResultAsync<Uint8Array> =>
	openPdf(o).map((d) => {
		const bytes = d.decrypted();
		d.close();
		return bytes;
	});

const readPages = (tables: Tables, document: PdfDocument): ResultAsync<Grid> =>
	sequence(
		pages(document).map(
			(n) => () =>
				document.page(n).asyncAndThen((p) => readPage(tables, p).andTee(p.close).orTee(p.close)),
		),
	);

const pages = (d: PdfDocument) => Array.from({ length: d.count }, (_, i) => i);

const readPage = (tables: Tables, page: PdfPage): ResultAsync<Grid> =>
	tables.detect(page.raster, page.bounds).andThen((found) =>
		sequence(
			found
				.filter(({ label }) => label === 'table')
				.sort((a, b) => a.y1 - b.y1)
				.map((t) => pad(t, page.bounds))
				.map(
					(region) => () =>
						tables.structure(page.raster, region).map((structure) =>
							toGrid(
								structure,
								page.words.filter((w) => contains(region, w)),
							),
						),
				),
		),
	);

const pad = (box: Box, bounds: Box): Box => ({
	x1: Math.max(bounds.x1, box.x1 - PADDING),
	y1: Math.max(bounds.y1, box.y1 - PADDING),
	x2: Math.min(bounds.x2, box.x2 + PADDING),
	y2: Math.min(bounds.y2, box.y2 + PADDING),
});

const contains = (box: Box, word: Word) => {
	const x = (word.x1 + word.x2) / 2;
	const y = (word.y1 + word.y2) / 2;
	return x >= box.x1 && x <= box.x2 && y >= box.y1 && y <= box.y2;
};
