import type { Snippet } from 'svelte';

/**
 * What a draft's page shows around its file: the footer, the form, and the
 * statement as a grid and as uploaded.
 */
export type Parts = { footer: Snippet; below: Snippet; grid: Snippet; original: Snippet };
