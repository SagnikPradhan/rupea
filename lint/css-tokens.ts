import { ESLintUtils } from '@typescript-eslint/utils';

const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi;
const LENGTH = /(?<![\w.-])-?(\d*\.?\d+)(px|rem|em)\b/g;
const ALLOWED = new Set(['1px', '2px', '1em']);
const MEDIA = /@(?:media|container)[^{]*/g;

type StyleElement = { loc: { start: { line: number; column: number } } };

const createRule = ESLintUtils.RuleCreator.withoutDocs;

export const cssTokens = createRule({
	meta: {
		type: 'problem',
		docs: { description: 'A style takes its colours and sizes from the tokens in global.css' },
		schema: [],
		messages: {
			colour: "Use a colour token, not '{{value}}'.",
			length: "Use a size token, not '{{value}}'.",
		},
	},
	defaultOptions: [],

	create(context) {
		const check = (node: StyleElement) => {
			const text = context.sourceCode.getText(node as never);
			const open = text.indexOf('>') + 1;
			const css = text.slice(open).replace(MEDIA, (m) => ' '.repeat(m.length));

			const report = (messageId: 'colour' | 'length', match: RegExpExecArray) => {
				const before = text.slice(0, open + match.index).split('\n');
				const line = node.loc.start.line + before.length - 1;
				const column =
					before.length === 1
						? node.loc.start.column + (before[0]?.length ?? 0)
						: (before.at(-1)?.length ?? 0);
				context.report({
					loc: { line, column },
					messageId,
					data: { value: match[0] },
				});
			};

			for (const m of css.matchAll(COLOUR)) report('colour', m);
			for (const m of css.matchAll(LENGTH))
				if (!ALLOWED.has(m[0].replace('-', '')) && Number(m[1]) !== 0) report('length', m);
		};

		return { SvelteStyleElement: check } as never;
	},
});
