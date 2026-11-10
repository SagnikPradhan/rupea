// Masks a real statement's personal details so that it can serve as a fixture.
//   pnpm tsx mask.ts list <statement>                   prints its texts, to choose what to mask
//   pnpm tsx mask.ts mask <statement> <masks.json> <out>
// masks.json names the details, so it stays outside the repository:
//   { "texts": { "<a text as listed>": "<its replacement>" }, "images": ["<width>x<height>"] }
import {
	decodePDFRawStream,
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFName,
	PDFNumber,
	PDFRawStream,
	PDFRef,
	PDFStream,
} from '@cantoo/pdf-lib';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import * as XLSX from 'xlsx';

type Masks = { texts: Record<string, string>; images: string[] };

// Statements print text in WinAnsi, a byte per character.
const winAnsi = new TextDecoder('windows-1252');
const bytesOf: Record<string, number> = Object.fromEntries(
	Array.from({ length: 256 }, (_, b) => [winAnsi.decode(new Uint8Array([b])), b]),
);

const TOKEN =
	/\((?:\\[\s\S]|[^\\()]|\((?:\\[\s\S]|[^\\()])*\))*\)|<<|>>|<[0-9A-Fa-f\s]*>|\[|\]|\/[^\s/[\]()<>{}%]*|%[^\r\n]*|[^\s/[\]()<>{}%]+/g;

const main = async ([command, file = '', masks = '', out = ''] = process.argv.slice(2)) => {
	const content = readFileSync(file);
	const pdf = extname(file).toLowerCase() === '.pdf';

	if (command === 'list') {
		const texts = pdf ? await pdfTexts(content) : sheetTexts(content);
		return console.log([...new Set(texts)].join('\n'));
	}

	const chosen: Masks = { images: [], ...JSON.parse(readFileSync(masks, 'utf8')) };
	const masked = pdf ? await maskPdf(content, chosen) : maskSheet(content, chosen);
	await verify({ masked, pdf, masks: chosen });
	writeFileSync(out, masked);
};

type Part = { start: number; end: number; text: string };

// A text-showing operator, and the strings it shows, where each sits in the stream.
type Shown = { start: number; end: number; text: string; parts: Part[] };

const shown = (stream: string): Shown[] => {
	const tokens = [...stream.matchAll(TOKEN)].map((t) => ({ text: t[0], start: t.index }));
	if (tokens.some((t) => t.text === 'BI')) return fail('inline images are not supported');

	return tokens.flatMap((t, i) => {
		const part = (o: { text: string; start: number }) => ({
			start: o.start,
			end: o.start + o.text.length,
			text: decode(o.text),
		});
		const operand = tokens[i - 1];
		if ((t.text === 'Tj' || t.text === "'" || t.text === '"') && operand) {
			const parts = [part(operand)];
			return [
				{ start: operand.start, end: t.start + t.text.length, text: parts[0]?.text ?? '', parts },
			];
		}
		if (t.text !== 'TJ') return [];

		const open = tokens.slice(0, i).findLastIndex((o) => o.text === '[');
		const parts = tokens
			.slice(open + 1, i - 1)
			.filter((o) => /^[(<]/.test(o.text))
			.map(part);
		const text = parts.map((p) => p.text).join('');
		return [{ start: tokens[open]?.start ?? 0, end: t.start + 2, text, parts }];
	});
};

const decode = (operand: string): string => {
	if (operand.startsWith('<'))
		return winAnsi.decode(Buffer.from(operand.slice(1, -1).replace(/\s/g, ''), 'hex'));

	const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
	return operand
		.slice(1, -1)
		.replace(/\\\r?\n/g, '')
		.replace(/\\([0-7]{1,3}|[\s\S])/g, (_, e: string) =>
			/^[0-7]/.test(e) ? winAnsi.decode(new Uint8Array([parseInt(e, 8)])) : (escapes[e] ?? e),
		);
};

const literal = (text: string) =>
	`(${[...text]
		.map((c) => latin1(bytesOf[c]))
		.map((c) => (c === '(' || c === ')' || c === '\\' ? `\\${c}` : c))
		.join('')})`;

// A replacement as long as the text keeps each string where it was; another is shown in one piece.
const respelled = (stream: string, shown: Shown, text: string) => {
	if (text.length !== shown.text.length) return `${literal(text)} Tj`;

	const offsets = shown.parts.map((_, i) =>
		shown.parts.slice(0, i).reduce((n, p) => n + p.text.length, 0),
	);
	const operator = stream.slice(shown.start, shown.end);
	return shown.parts
		.map((p, i) => ({ ...p, text: text.slice(offsets[i], (offsets[i] ?? 0) + p.text.length) }))
		.toReversed()
		.reduce(
			(o, p) => o.slice(0, p.start - shown.start) + literal(p.text) + o.slice(p.end - shown.start),
			operator,
		);
};

const latin1 = (b: number | undefined) => {
	if (b === undefined) return fail('a replacement is not WinAnsi text');
	return String.fromCharCode(b);
};

type Drawing = { ref: PDFRef; stream: PDFRawStream; resources: PDFDict | undefined };

// Page contents and the forms they draw, which hold the text of some statements.
const drawings = (document: PDFDocument): Drawing[] =>
	document.getPages().flatMap((page) => {
		const resources = page.node.Resources();
		const contents = page.node.get(PDFName.of('Contents'));
		const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
		const own = refs.flatMap((r) => drawing(document, r, resources));
		return [...own, ...forms(document, resources)];
	});

const drawing = (d: PDFDocument, ref: unknown, resources: PDFDict | undefined): Drawing[] => {
	const stream = ref instanceof PDFRef ? d.context.lookup(ref) : undefined;
	return ref instanceof PDFRef && stream instanceof PDFRawStream
		? [{ ref, stream, resources }]
		: [];
};

const forms = (d: PDFDocument, resources: PDFDict | undefined): Drawing[] =>
	xobjects(d, resources).flatMap(({ ref, stream }) => {
		if (stream.dict.get(PDFName.of('Subtype')) !== PDFName.of('Form')) return [];

		const own = stream.dict.lookupMaybe(PDFName.of('Resources'), PDFDict) ?? resources;
		return [...drawing(d, ref, own), ...forms(d, own)];
	});

const xobjects = (d: PDFDocument, resources: PDFDict | undefined) => {
	const dict = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
	return (dict?.entries() ?? []).flatMap(([name, ref]) => {
		const stream = ref instanceof PDFRef ? d.context.lookup(ref) : undefined;
		return ref instanceof PDFRef && stream instanceof PDFStream
			? [{ name, ref, stream, dict }]
			: [];
	});
};

const pdfTexts = async (content: Uint8Array) => {
	const document = await PDFDocument.load(content, { updateMetadata: false });
	return drawings(document).flatMap((d) => shown(streamText(d.stream)).map((s) => s.text));
};

const streamText = (s: PDFRawStream) =>
	Buffer.from(decodePDFRawStream(s).decode()).toString('latin1');

const maskPdf = async (content: Uint8Array, masks: Masks) => {
	const document = await PDFDocument.load(content, { updateMetadata: false });
	const allowed = new Set((await pdfTexts(content)).join(''));

	document.getPages().forEach((page) => {
		const annotations = page.node.Annots()?.asArray() ?? [];
		annotations.forEach((a) => a instanceof PDFRef && document.context.delete(a));
		page.node.delete(PDFName.of('Annots'));
	});
	drawings(document).forEach((d) => redraw({ document, drawing: d, masks, allowed }));

	document.catalog.delete(PDFName.of('AcroForm'));
	delete document.context.trailerInfo.Info;
	unreachable(document).forEach((r) => document.context.delete(r));
	return document.save({ useObjectStreams: false, updateFieldAppearances: false });
};

// Objects nothing points to still sit in the file, such as a signature over the original.
const unreachable = (document: PDFDocument) => {
	const reached = new Set<string>();
	const stack: unknown[] = [document.context.trailerInfo.Root];
	while (stack.length > 0) {
		const o = stack.pop();
		if (o instanceof PDFRef && !reached.has(o.tag)) {
			reached.add(o.tag);
			stack.push(document.context.lookup(o));
		}
		if (o instanceof PDFDict) stack.push(...o.values());
		if (o instanceof PDFStream) stack.push(...lengthless(o));
		if (o instanceof PDFArray) stack.push(...o.asArray());
	}

	const refs = document.context.enumerateIndirectObjects().map(([r]) => r);
	return refs.filter((r) => !reached.has(r.tag));
};

// pdf-lib writes a stream's length into the stream, so a length kept as an object goes unused.
const lengthless = (s: PDFStream) =>
	s.dict.entries().flatMap(([k, v]) => (k === PDFName.of('Length') ? [] : [v]));

type RedrawOptions = {
	document: PDFDocument;
	drawing: Drawing;
	masks: Masks;
	allowed: Set<string>;
};

const redraw = ({ document, drawing, masks, allowed }: RedrawOptions) => {
	const images = xobjects(document, drawing.resources).filter((x) =>
		masks.images.includes(size(x.stream)),
	);
	images.forEach((x) => {
		x.dict?.delete(x.name);
		document.context.delete(x.ref);
	});

	const stream = streamText(drawing.stream);
	const hidden = images.map((x) => new RegExp(`${x.name.asString()}\\s+Do`, 'g'));
	const replaced = shown(stream).flatMap((s) => {
		const text = masks.texts[s.text];
		return text === undefined ? [] : [{ shown: s, text }];
	});
	replaced.forEach(({ text }) => {
		const missing = [...text].filter((c) => !allowed.has(c));
		if (missing.length > 0) return fail(`the statement's fonts lack ${missing.join('')}`);
	});

	const spliced = replaced
		.toReversed()
		.reduce(
			(t, r) =>
				t.slice(0, r.shown.start) + respelled(stream, r.shown, r.text) + t.slice(r.shown.end),
			stream,
		);
	const drawn = hidden.reduce((t, h) => t.replace(h, ''), spliced);

	const dict = new Map(drawing.stream.dict.entries());
	['Filter', 'DecodeParms', 'Length'].forEach((k) => dict.delete(PDFName.of(k)));
	document.context.assign(
		drawing.ref,
		document.context.flateStream(
			Buffer.from(drawn, 'latin1'),
			Object.fromEntries([...dict].map(([k, v]) => [k.decodeText(), v])),
		),
	);
};

const size = (s: PDFStream) => {
	const number = (k: string) => s.dict.lookupMaybe(PDFName.of(k), PDFNumber)?.asNumber();
	return `${number('Width')}x${number('Height')}`;
};

const sheetTexts = (content: Uint8Array) => {
	const book = XLSX.read(content, { type: 'buffer', dense: true });
	return Object.values(book.Sheets).flatMap((s) =>
		(s['!data'] ?? []).flatMap((r) =>
			(r ?? []).flatMap((c) => (c?.v === undefined ? [] : [String(c.v)])),
		),
	);
};

// Rebuilt from cell values, so the original's properties and comments are left behind.
const maskSheet = (content: Uint8Array, masks: Masks) => {
	const book = XLSX.read(content, { type: 'buffer', dense: true });
	const sheets = Object.entries(book.Sheets).map(([name, sheet]): [string, XLSX.WorkSheet] => {
		const rows = (sheet['!data'] ?? []).map((r) =>
			(r ?? []).map((c) => (c?.v === undefined ? '' : masked(c, masks))),
		);
		const rebuilt = XLSX.utils.aoa_to_sheet(rows);
		rebuilt['!merges'] = sheet['!merges'] ?? [];
		rebuilt['!cols'] = sheet['!cols'] ?? [];
		return [name, rebuilt];
	});

	const rebuilt = XLSX.utils.book_new();
	sheets.forEach(([name, sheet]) => XLSX.utils.book_append_sheet(rebuilt, sheet, name));
	return new Uint8Array(XLSX.write(rebuilt, { type: 'buffer', bookType: 'biff8' }));
};

const masked = (cell: XLSX.CellObject, masks: Masks): string | number | boolean => {
	const value = cell.v instanceof Date ? cell.v.toISOString() : (cell.v ?? '');
	const replacement = masks.texts[String(value)];
	if (replacement === undefined) return value;

	return cell.t === 'n' && replacement !== '' && !Number.isNaN(Number(replacement))
		? Number(replacement)
		: replacement;
};

type VerifyOptions = {
	masked: Uint8Array;
	pdf: boolean;
	masks: Masks;
};

// Nothing masked may survive anywhere in the file: in its texts, its streams or its raw bytes.
const verify = async ({ masked, pdf, masks }: VerifyOptions) => {
	const texts = pdf ? await pdfTexts(masked) : sheetTexts(masked);
	const streams = pdf ? await everyStream(masked) : '';
	const haystack = [
		...texts,
		streams,
		Buffer.from(masked).toString('latin1'),
		Buffer.from(masked).toString('utf16le'),
	].join('\n');

	const changed = Object.entries(masks.texts).filter(([from, to]) => from !== to);
	const runs = changed.flatMap(([from, to]) =>
		(from.match(/\d{6,}/g) ?? []).filter((r) => !to.includes(r)),
	);
	const leaks = [
		...changed.map(([from]) => from).filter((f) => texts.includes(f)),
		...changed.map(([from]) => from).filter((f) => f.length >= 8 && haystack.includes(f)),
		...runs.filter((r) => haystack.includes(r)),
	];
	if (leaks.length > 0) return fail(`still in the masked file: ${leaks.join(' | ')}`);

	const missing = Object.values(masks.texts).filter((t) => t !== '' && !texts.includes(t));
	if (missing.length > 0) return fail(`not written: ${missing.join(' | ')}`);

	const traces = pdf ? await traced(masked) : [];
	if (traces.length > 0) return fail(`still in the masked file: ${traces.join(' | ')}`);
};

// What tells of the original file rather than its text: when and how it was made, and its signature.
const traced = async (content: Uint8Array) => {
	const document = await PDFDocument.load(content, { updateMetadata: false });
	return [
		...(document.context.trailerInfo.Info ? ['its document info'] : []),
		...(document.catalog.has(PDFName.of('AcroForm')) ? ['its form'] : []),
		...(unreachable(document).length > 0 ? ['objects nothing points to'] : []),
	];
};

const everyStream = async (content: Uint8Array) => {
	const document = await PDFDocument.load(content, { updateMetadata: false });
	return document.context
		.enumerateIndirectObjects()
		.flatMap(([, o]) => (o instanceof PDFRawStream && !photo(o) ? [streamText(o)] : []))
		.join('\n');
};

const fail = (message: string): never => {
	console.error(message);
	return process.exit(1);
};

const photo = (s: PDFRawStream) =>
	['DCTDecode', 'JPXDecode'].some((f) => s.dict.toString().includes(`/${f}`));

await main();
