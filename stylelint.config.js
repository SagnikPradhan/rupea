export default {
	extends: ['stylelint-config-standard'],
	customSyntax: 'postcss-html',
	rules: {
		'color-no-hex': true,
		'color-named': 'never',
		'function-disallowed-list': ['/^(rgba?|hsla?|hwb|lab|lch|oklab|oklch)$/'],
		'unit-disallowed-list': [['px', 'rem', 'em'], { ignoreMediaFeatureNames: { rem: ['width'] } }],
		'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global'] }],
	},
};
