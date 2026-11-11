import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

/** The prepositions and prefixes of ADR 0035, and the verbs of ADR 0016. */
const PREPOSITION = /[a-z0-9](For|Of|On|In|From|Over)$/;
const PREFIX =
	/^(is|has|by|parse|print|format|to|find|list|read|create|save|delete|rename|open)([A-Z0-9]|$)/;

const createRule = ESLintUtils.RuleCreator.withoutDocs;
const description = 'Name a function by what it returns and what its first argument is';
const message =
	"'{{name}}' should end in For, Of, On, In, From or Over, or start with a verb or prefix from ADR 0035";

export const functionNames = createRule({
	meta: {
		type: 'suggestion',
		docs: { description },
		schema: [
			{
				type: 'object',
				properties: { allow: { type: 'array', items: { type: 'string' } } },
				additionalProperties: false,
			},
		],
		messages: { unnamed: message },
	},
	defaultOptions: [{ allow: [] as string[] }],

	create(context, [options]) {
		const allowed = new Set(options.allow);

		const check = (name: TSESTree.Identifier) => {
			if (!/^[a-z]/.test(name.name) || allowed.has(name.name)) return;
			if (PREPOSITION.test(name.name) || PREFIX.test(name.name)) return;
			context.report({ node: name, messageId: 'unnamed', data: { name: name.name } });
		};

		return {
			'ExportNamedDeclaration > FunctionDeclaration'(n: TSESTree.FunctionDeclaration) {
				if (n.id) check(n.id);
			},
			'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator'(
				node: TSESTree.VariableDeclarator,
			) {
				const init = node.init?.type;
				const isFunction = init === 'ArrowFunctionExpression' || init === 'FunctionExpression';
				if (isFunction && node.id.type === 'Identifier') check(node.id);
			},
		};
	},
});
