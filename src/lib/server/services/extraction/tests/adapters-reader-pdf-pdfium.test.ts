import { err } from '#lib/server/shared/result/result.ts';
import { openPdf } from '#services/extraction/adapters/reader-pdf-pdfium.ts';
import { PDFDocument } from '@cantoo/pdf-lib';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

const saving = vi.hoisted(() => ({ as: 'usual' as 'usual' | 'refused' | 'thrown' }));

// Pdfium saves any document it opened, so only a stub reaches a failed save.
vi.mock(import('@embedpdf/pdfium'), async (original) => {
	const pdfium = await original();
	return {
		...pdfium,
		init: async (options) => {
			const m = await pdfium.init(options);
			const real = m.FPDF_SaveAsCopy;
			return Object.assign(m, {
				FPDF_SaveAsCopy: (d: number, w: number, f: number) => {
					if (saving.as === 'thrown') throw new Error('out of memory');
					return saving.as === 'usual' && real(d, w, f);
				},
			});
		},
	};
});

const plain = () => readFile(join(import.meta.dirname, 'fixtures/sbi-savings.pdf'));

const locked = async () => {
	const document = await PDFDocument.load(await plain());
	document.encrypt({ userPassword: 'secret', ownerPassword: 'secret' });
	return document.save();
};

const opened = async (content: Uint8Array, password?: string) => {
	const document = await openPdf({ name: 'a.pdf', content, password });
	if (document.isErr()) throw new Error(document.error.type);
	return document.value;
};

describe('opening a PDF with pdfium', () => {
	it('counts its pages and measures them in points', async () => {
		const document = await opened(await plain());
		expect(document.count).toBe(2);

		const page = document.page(0);
		expect(page.isOk() && page.value.bounds).toEqual({ x1: 0, y1: 0, x2: 595, y2: 842 });
		document.close();
	});

	it('refuses a file that is not a PDF', async () => {
		const document = await openPdf({
			name: 'a.pdf',
			content: new TextEncoder().encode('not a pdf'),
		});
		expect(document).toMatchObject({ error: { type: 'CannotReadFile', path: 'a.pdf' } });
	});

	it('tells a locked PDF apart from an unreadable one', async () => {
		const content = await locked();
		expect(await openPdf({ name: 'a.pdf', content })).toMatchObject({
			error: { type: 'ExtractionLocked', path: 'a.pdf' },
		});
		expect(await openPdf({ name: 'a.pdf', content, password: 'wrong' })).toMatchObject({
			error: { type: 'ExtractionLocked' },
		});

		const document = await opened(content, 'secret');
		expect(document.count).toBe(2);
		document.close();
	});
});

describe('reading a page with pdfium', () => {
	const page = async () => {
		const document = await opened(await plain());
		const first = document.page(0);
		if (first.isErr()) throw new Error(first.error.type);
		return first.value;
	};

	it('reads words with boxes measured from the top left', async () => {
		const read = await page();
		const words = read.words;

		expect(words.slice(0, 3).map((w) => w.text)).toEqual(['Account', 'Summary', 'Welcome:']);
		expect(words.map((w) => w.text)).toContain('Balance');

		const [first] = words;
		expect(first?.y1).toBeLessThan(first?.y2 ?? 0);
		expect(first?.y1).toBeLessThan(read.bounds.y2 / 2);
		read.close();
	});

	it('rasters a region at the size asked for, keeping the aspect ratio', async () => {
		const read = await page();
		const whole = read.raster(read.bounds, 800);

		expect([whole.width, whole.height]).toEqual([565, 800]);
		expect(whole.data).toHaveLength(565 * 800 * 4);
		expect(whole.data.some((b) => b !== 0xff)).toBe(true);
		read.close();
	});

	it('keeps at least one pixel for a sliver of a region', async () => {
		const read = await page();
		const sliver = read.raster({ x1: 0, y1: 0, x2: 200, y2: 0.1 }, 10);

		expect([sliver.width, sliver.height]).toEqual([10, 1]);
		read.close();
	});

	it('leaves the paper around the page white and opaque', async () => {
		const read = await page();
		const right = read.bounds.x2;
		const corner = read.raster({ x1: right, y1: 0, x2: right + 20, y2: 20 }, 4);

		expect([...corner.data]).toEqual(Array.from({ length: 4 * 4 * 4 }, () => 0xff));
		read.close();
	});

	it('writes a locked PDF without its password', async () => {
		const document = await opened(await locked(), 'secret');
		const content = document.decrypted()._unsafeUnwrap();
		document.close();

		const unlocked = await openPdf({ name: 'a.pdf', content });
		expect(unlocked.isOk() && unlocked.value.count).toBe(2);
		if (unlocked.isOk()) unlocked.value.close();
	});

	it.for(['refused', 'thrown'] as const)(
		'fails to write a locked PDF when saving is %s',
		async (as) => {
			saving.as = as;
			onTestFinished(() => void (saving.as = 'usual'));
			const document = await opened(await locked(), 'secret');

			expect(document.decrypted()).toEqual(
				err({ type: 'CannotReadFile', path: 'a.pdf', reason: 'not saved unlocked' }),
			);
			document.close();
		},
	);
});
