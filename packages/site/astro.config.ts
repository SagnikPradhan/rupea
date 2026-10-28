import { unified } from '@astrojs/markdown-remark';
import { defineConfig } from 'astro/config';
import relativeLinks from 'astro-rehype-relative-markdown-links';

export default defineConfig({
	site: 'https://rupea.app',
	markdown: {
		syntaxHighlight: false,
		processor: unified({ rehypePlugins: [relativeLinks] }),
	},
});
