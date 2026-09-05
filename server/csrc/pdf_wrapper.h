#ifndef PDF_WRAPPER_H
#define PDF_WRAPPER_H

typedef struct PdfDocument PDFDocument;

typedef struct {
	char text;
	double x1;
	double y1;
	double x2;
	double y2;
} PDFChar;

typedef struct {
	int page;
	PDFChar *chars;
	int chars_count;
} PDFPage;

PDFDocument *read_pdf(const char *filename, const char *password);
PDFPage *read_pdf_page(PDFDocument *doc, int page);
int close_pdf_page(PDFPage *page);
int close_pdf(PDFDocument *doc);

#endif
