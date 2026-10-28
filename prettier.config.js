/** @type {import("prettier").Config} */
const config = {
	useTabs: true,
	singleQuote: true,
	trailingComma: 'all',
	printWidth: 100,
	plugins: ['prettier-plugin-svelte', 'prettier-plugin-astro'],
	overrides: [
		{ files: '*.svelte', options: { parser: 'svelte' } },
		{ files: '*.astro', options: { parser: 'astro' } },
	],
};

export default config;
