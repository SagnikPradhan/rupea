const LENGTH = '/[0-9.]+(rem|em|px)/';

export default {
	ignoreFiles: ['build/**', 'coverage/**', 'packages/site/dist/**', '.svelte-kit/**', '.claude/**'],
	rules: {
		'color-no-hex': true,
		'color-named': 'never',
		'declaration-property-value-disallowed-list': {
			'/^(gap|row-gap|column-gap|margin|padding|font-size)/': [LENGTH],
			'box-shadow': ['/.*/'],
			'text-shadow': ['/.*/'],
			'/^background/': ['/gradient/'],
			'border-radius': ['/^(?!var\\(--radius\\)$|0$).*/'],
		},
	},
	overrides: [
		{ files: ['**/*.svelte', '**/*.astro'], customSyntax: 'postcss-html' },
		{
			files: ['packages/theme/**'],
			rules: { 'color-no-hex': null, 'color-named': null },
		},
	],
};
