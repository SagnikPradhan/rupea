import { unified, type RehypePlugin } from '@astrojs/markdown-remark';
import { defineConfig } from 'astro/config';
import relativeLinks from 'astro-rehype-relative-markdown-links';
import type { Root, RootContent } from 'hast';

/** Marks Markdown tables as labelled, so the theme sets their column labels like the app's. */
const labelTables: RehypePlugin = () => label;

export default defineConfig({
	site: 'https://rupea.app',
	markdown: {
		syntaxHighlight: false,
		processor: unified({ rehypePlugins: [relativeLinks, labelTables] }),
	},
});

function label(node: Root | RootContent) {
	if (node.type === 'element' && node.tagName === 'table') node.properties.className = ['labelled'];
	if ('children' in node) node.children.forEach(label);
}
