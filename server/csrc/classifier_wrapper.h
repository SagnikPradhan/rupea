#ifndef CLASSIFIER_H
#define CLASSIFIER_H

#include <stddef.h>

typedef struct ClassifierRuntime ClassifierRuntime;

typedef struct {
	size_t length;
	char *data;
} String;

typedef struct {
	String word;
	String label;
} CategorisedWord;

typedef struct {
	CategorisedWord *data;
	size_t length;
} CategorisationResult;

ClassifierRuntime *classifier_init(void);
CategorisationResult *classifier_categorise(ClassifierRuntime *runtime, const char *sentence);
void classifier_categorisation_result_free(CategorisationResult *result);
void classifier_free(ClassifierRuntime *runtime);

#endif
