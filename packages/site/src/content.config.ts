import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

const manual = defineCollection({
	loader: glob({ pattern: '*.md', base: '../../docs/manual' }),
});

export const collections = { manual };
