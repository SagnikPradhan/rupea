import { Linter } from 'eslint';
import svelte from 'eslint-plugin-svelte';
import { describe, expect, it } from 'vitest';
import { cssTokens } from '../../../../lint/css-tokens.ts';

const lint = (css: string) =>
	new Linter().verify(
		`<p>x</p>\n<style>\n${css}\n</style>`,
		[
			...(svelte.configs.recommended as never[]),
			{
				files: ['**/*.svelte'],
				plugins: { rupea: { rules: { 'css-tokens': cssTokens as never } } },
				rules: { 'rupea/css-tokens': 'error' },
			},
		],
		'a.svelte',
	);

describe('the css-tokens rule', () => {
	it('flags a colour written out', () => {
		expect(lint('p { color: #fff; background: rgb(0 0 0); }').map((m) => m.message)).toEqual([
			"Use a colour token, not '#fff'.",
			"Use a colour token, not 'rgb('.",
		]);
	});

	it('flags a length written out, and says where', () => {
		const [m] = lint('p {\n  padding: 12px;\n}');
		expect(m?.message).toBe("Use a size token, not '12px'.");
		expect(m?.line).toBe(4);
	});

	it('flags a negative length, but not a negative line', () => {
		const messages = lint('p { margin: -12px; translate: -3px; top: -1px; }').map((m) => m.message);
		expect(messages).toEqual(["Use a size token, not '-12px'.", "Use a size token, not '-3px'."]);
	});

	it('leaves tokens, lines, zero and media and container widths alone', () => {
		const css =
			'p { color: var(--color-ink); border: 1px solid var(--color-border); margin: 0; padding: calc(var(--size-2) * 0.5); }\n@media (width >= 90rem) { p { color: black; } }\n@container (width < 48rem) { p { margin: 0; } }';
		expect(lint(css)).toEqual([]);
	});
});
