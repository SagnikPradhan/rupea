import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

type AnyFunction =
	TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

const maxLength = (n: number) => (n === 1 ? 1 : n <= 3 ? 2 : n <= 10 ? 12 : n <= 30 ? 24 : 32);
const ignored = new Set(['id', 'url', 'uri', 'db', 'sql', 'api', 'err', 'ctx', 'req', 'res']);

/** A callback that `withContext('key')` calls names its parameter after the key. */
const isContextCallback = (node: AnyFunction) =>
	node.parent.type === 'CallExpression' &&
	node.parent.callee.type === 'CallExpression' &&
	node.parent.callee.callee.type === 'Identifier' &&
	node.parent.callee.callee.name === 'withContext';

const createRule = ESLintUtils.RuleCreator.withoutDocs;
const description = 'Prefer shorter variable names in shorter functions';
const message = "'{{name}}' is too long for a {{lines}}-line function (max {{maxLength}})";

export const localNameLength = createRule({
	meta: {
		type: 'suggestion',
		docs: { description },
		schema: [],
		messages: { tooLong: message },
	},
	defaultOptions: [],

	create(context) {
		const check = (node: AnyFunction) => {
			const lines = node.body.loc.end.line - node.body.loc.start.line + 1;
			const max = maxLength(lines);

			const checkName = (name: TSESTree.Node) => {
				if (name.type !== 'Identifier') return;
				if (ignored.has(name.name) || name.name.length <= max) return;
				context.report({
					node: name,
					messageId: 'tooLong',
					data: { name: name.name, lines, maxLength: max },
				});
			};

			if (!isContextCallback(node)) for (const param of node.params) checkName(param);
			for (const variable of context.sourceCode.getScope(node).variables)
				for (const def of variable.defs) if (def.type === 'Variable') checkName(def.name);
		};

		return {
			FunctionDeclaration: check,
			FunctionExpression: check,
			ArrowFunctionExpression: check,
		};
	},
});
