import { form } from '$app/server';
import { cycleTheme } from '#lib/server/shared/theme.ts';

/** Answers with the new theme, so the page needn't reload anything to show it. */
export const toggleTheme = form(async () => cycleTheme());
