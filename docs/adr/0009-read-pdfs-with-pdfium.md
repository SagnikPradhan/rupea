# Read PDFs with pdfium

Extraction reads a statement by rastering each page for the table-transformer models and taking words with their boxes from the text layer. `pdfjs-dist` did both, but only through a canvas: `@napi-rs/canvas` rendered the page at twice its size, and `shared/onnx/detr.ts` cropped and scaled a region out of that canvas a second time to reach the size a model reads. pdf.js also cannot write a decrypted copy of a locked file — `saveDocument` is an incremental update and keeps the original `/Encrypt` dictionary — and a locked statement has to be stored unlocked, since a password nobody kept cannot be asked for twice.

`@embedpdf/pdfium` is pdfium compiled to WebAssembly, MIT over pdfium's BSD-3, with no dependencies and 419 typed `FPDF_*` functions. `adapters/reader-pdf-pdfium.ts` is the only file that touches it. Three calls carry the design:

- `FPDF_RenderPageBitmapWithMatrix` renders a region straight to the pixels a model reads, so nothing is scaled twice. `detr.ts` no longer crops; it normalises an `Image` a `Raster` hands it.
- `FPDFText_GetCharBox` gives a box per character. Words are runs of non-space characters, so a word's box is the union of its own characters rather than an interpolation along a text run.
- `EPDF_RemoveEncryption` with `PDFiumExt_SaveAsCopy` writes a copy that opens with no password. Nothing uses it yet; it is what makes storing a statement unlocked possible.

On the two-page fixture, opening costs 21ms including instantiating the 4.5 MB module, a page's words cost 3ms, and a full-page raster at 800 pixels costs 7ms. That is 4% of the read; the models are the other 96%. pdf.js was 22% cold and 3% in steady state, so this was never a speed decision — it is about reading the page once, at the right size, and being able to decrypt.

## Considered Options

- **Keep pdf.js and add qpdf for decryption**: two PDF engines, and the WebAssembly builds of qpdf on npm are single-author and years stale.
- **`clawpdf`**: the same pdfium, smaller, with a first-class `password` option and a pinned wasm checksum. Its public API is `page.text()` as a flat string and whole-page rasters, so it cannot give word boxes or render a region. The calls we need are in its wasm but not in its types, reachable only through an undeclared `engine.module`.
- **Our own binding over libpdfium or libqpdf, through napi-rs or node-ffi**: a per-platform artifact to build, sign and ship for a desktop app, to reach the same library the wasm already exposes.
- **A pure-Rust reader (`lopdf`)**: cannot decrypt AES-256 revision 6, which is what recent bank statements use.

## Consequences

- No native module in the dependency tree, so a packaged desktop app needs no rebuild per Electron ABI and the hosted service needs no per-platform image.
- `shared/onnx` no longer knows what a page is. `detect` takes a `Raster`, a function from a region and a size to pixels, so anything that can rasterise a region can be read.
- `adapters/reader-pdf-pdfium.ts` owns pointers. Documents and pages are closed by hand, and a document's bytes stay in the module's heap until it is.
- One module instance serves the process. It holds no state of ours between documents, so it is loaded once and kept rather than passed through the context.
- `READER_VERSION` in `adapters/reader.ts` stays `1`. Nothing is released, so there are no grids cached by pdf.js to re-read; bump it on the first change to reading after there are.
