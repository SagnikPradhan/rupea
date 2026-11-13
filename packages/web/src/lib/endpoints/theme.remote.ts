import { form } from '$app/server';
import { cycleTheme } from '#lib/web/shared/theme.ts';

/** Answers with the new theme, so the page needn't reload anything to show it. */
export const toggleTheme = form(() => cycleTheme());
