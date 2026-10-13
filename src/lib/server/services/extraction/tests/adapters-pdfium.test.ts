import { openPdf } from '#services/extraction/adapters/pdfium.ts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const fixture = (n: string) => readFile(join(import.meta.dirname, 'fixtures', n));

const open = async (name: string, password?: string) => {
	const content = await fixture(name);
	return openPdf({ name, content, password });
};

const opened = async (name: string, password?: string) => {
	const document = await open(name, password);
	if (document.isErr()) throw new Error(document.error.type);
	return document.value;
};

describe('opening a PDF with pdfium', () => {
	it('counts its pages and measures them in points', async () => {
		const document = await opened('statement.pdf');
		expect(document.count).toBe(2);

		const page = document.page(0);
		expect(page.isOk() && page.value.bounds.x2).toBeCloseTo(595.28, 1);
		expect(page.isOk() && page.value.bounds.y2).toBeCloseTo(841.89, 1);
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
		expect(await open('statement-locked.pdf')).toMatchObject({
			error: { type: 'ExtractionLocked', path: 'statement-locked.pdf' },
		});
		expect(await open('statement-locked.pdf', 'wrong')).toMatchObject({
			error: { type: 'ExtractionLocked' },
		});

		const document = await opened('statement-locked.pdf', 'secret');
		expect(document.count).toBe(2);
		document.close();
	});
});

describe('reading a page with pdfium', () => {
	const page = async () => {
		const document = await opened('statement.pdf');
		const first = document.page(0);
		if (first.isErr()) throw new Error(first.error.type);
		return first.value;
	};

	it('reads words with boxes measured from the top left', async () => {
		const read = await page();
		const words = read.words;

		expect(words.slice(0, 3).map((w) => w.text)).toEqual(['HDFC', 'BANK', 'Ltd.']);
		expect(words.map((w) => w.text)).toContain('Chq./Ref.No.');

		const [first] = words;
		expect(first?.y1).toBeLessThan(first?.y2 ?? 0);
		expect(first?.y1).toBeLessThan(read.bounds.y2 / 2);
		read.close();
	});

	it('rasters a region at the size asked for, keeping the aspect ratio', async () => {
		const read = await page();
		const whole = read.raster(read.bounds, 800);

		expect([whole.width, whole.height]).toEqual([566, 800]);
		expect(whole.data).toHaveLength(566 * 800 * 4);
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
		const corner = read.raster({ x1: 0, y1: 0, x2: 20, y2: 20 }, 4);

		expect([...corner.data]).toEqual(Array.from({ length: 4 * 4 * 4 }, () => 0xff));
		read.close();
	});

	it('writes a locked PDF without its password', async () => {
		const document = await opened('statement-locked.pdf', 'secret');
		const content = document.decrypted();
		document.close();

		const unlocked = await openPdf({ name: 'statement.pdf', content });
		expect(unlocked.isOk() && unlocked.value.count).toBe(2);
		if (unlocked.isOk()) unlocked.value.close();
	});
});
