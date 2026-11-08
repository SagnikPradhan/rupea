/** @type {import('prettier').Config} */
const config = {
	useTabs: true,
	singleQuote: true,
	trailingComma: 'all',
	printWidth: 100,
	jsdocPrintWidth: 80,
	tsdoc: true,
	plugins: ['prettier-plugin-svelte', 'prettier-plugin-astro', 'prettier-plugin-jsdoc'],
	overrides: [
		{ files: '*.svelte', options: { parser: 'svelte' } },
		{ files: '*.astro', options: { parser: 'astro' } },
	],
};

export default config;
