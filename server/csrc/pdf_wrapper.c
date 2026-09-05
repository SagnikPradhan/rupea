#include "pdf_wrapper.h"
#include "glib.h"
#include "poppler-document.h"
#include "poppler-page.h"
#include "poppler.h"

struct PdfDocument {
	PopplerDocument *doc;
};

struct PDFChar {
	char text;
	double x1;
	double y1;
	double x2;
	double y2;
};

struct PDFPage {
	int page;
	PDFChar *chars;
	int chars_count;
};

PDFDocument *read_pdf(const char *filename, const char *password) {
	GError *error = NULL;

	const char *uri = g_filename_to_uri(filename, NULL, &error);
	if (uri == NULL) {
		g_printerr("Failed to convert filename to URI: %s\n", error->message);
		g_error_free(error);
		return NULL;
	}

	PopplerDocument *poppler_doc = poppler_document_new_from_file(uri, password, &error);
	if (poppler_doc == NULL) {
		g_printerr("Failed to read PDF: %s\n", error->message);
		g_error_free(error);
		return NULL;
	}

	g_free((char *)uri);
	PDFDocument *doc = g_new(PDFDocument, 1);
	doc->doc = poppler_doc;
	return doc;
}

PDFPage *read_pdf_page(PDFDocument *doc, int page) {
	GError *error = NULL;
	if (doc == NULL) { return NULL; }

	PopplerPage *poppler_page = poppler_document_get_page(doc->doc, page);
	if (poppler_page == NULL) {
		g_printerr("Failed to read PDF page: %s\n", error->message);
		g_error_free(error);
		return NULL;
	}

	gchar *text = poppler_page_get_text(poppler_page);
	guint rect_count;
	PopplerRectangle *rect;
	poppler_page_get_text_layout(poppler_page, &rect, &rect_count);

	PDFPage *pdf_page = g_new(PDFPage, 1);
	pdf_page->page = page;
	pdf_page->chars = g_new(PDFChar, rect_count);
	pdf_page->chars_count = rect_count;

	for (int i = 0; i < rect_count; i++) {
		pdf_page->chars[i].text = text[i];
		pdf_page->chars[i].x1 = rect[i].x1;
		pdf_page->chars[i].y1 = rect[i].y1;
		pdf_page->chars[i].x2 = rect[i].x2;
		pdf_page->chars[i].y2 = rect[i].y2;
	}

	g_free(text);
	g_free(rect);
	g_object_unref(poppler_page);

	return pdf_page;
}

int close_pdf_page(PDFPage *page) {
	if (page == NULL) { return 0; }
	g_free(page->chars);
	g_free(page);
	return 0;
}

int close_pdf(PDFDocument *doc) {
	if (doc == NULL) { return 0; }
	g_object_unref(doc->doc);
	g_free(doc);
	return 0;
}
