import { dirname, relative, resolve, sep } from 'node:path';
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

type Place = 'shared' | 'server' | 'web';

const SPECIFIERS: Record<string, Place> = {
	'@rupea/shared/': 'shared',
	'@rupea/server/': 'server',
	'#lib/server/': 'server',
	'#services/': 'server',
	'#lib/web/': 'web',
	'#lib/endpoints/': 'web',
	'#routes/': 'web',
};

const FORBIDDEN: Record<Place, Place[]> = {
	shared: ['server', 'web'],
	server: ['web'],
	web: ['server'],
};

const FRAMEWORK = /^((\$app|@sveltejs\/kit|svelte)(\/.*)?|#lib(\/index(\.[jt]s)?)?)$/;

const createRule = ESLintUtils.RuleCreator.withoutDocs;
const description = 'Keep imports between shared, server and web pointing one way';
const message = 'The {{from}} code must not import {{to}} code ({{source}})';
const framework = 'Shared code must not import the web framework ({{source}})';

export const packageBoundaries = createRule({
	meta: {
		type: 'problem',
		docs: { description },
		schema: [
			{
				type: 'object',
				properties: { allowServer: { type: 'boolean' } },
				additionalProperties: false,
			},
		],
		messages: { crossing: message, framework },
	},
	defaultOptions: [{ allowServer: false }],

	create(context, [options]) {
		const file = resolve(context.cwd, context.filename);
		const from = placeOf(context.cwd, file);
		if (!from) return {};

		const check = (node: TSESTree.Node, source: string) => {
			if (from === 'shared' && FRAMEWORK.test(source))
				return context.report({ node, messageId: 'framework', data: { source } });

			const to = targetOf(context.cwd, file, source);
			if (!to || !FORBIDDEN[from].includes(to)) return;
			if (from === 'web' && options.allowServer) return;
			context.report({ node, messageId: 'crossing', data: { from, to, source } });
		};

		return {
			ImportDeclaration: (n) => check(n, n.source.value),
			ExportNamedDeclaration: (n) => n.source && check(n, n.source.value),
			ExportAllDeclaration: (n) => check(n, n.source.value),
			ImportExpression: (n) =>
				n.source.type === 'Literal' && typeof n.source.value === 'string'
					? check(n, n.source.value)
					: undefined,
		};
	},
});

const placeOf = (cwd: string, path: string): Place | null => {
	const inRepo = relative(cwd, path).split(sep).join('/');
	if (inRepo.startsWith('packages/shared/')) return 'shared';
	if (inRepo.startsWith('packages/server/')) return 'server';
	if (inRepo.startsWith('packages/')) return null;
	return 'web';
};

const targetOf = (cwd: string, file: string, source: string): Place | null => {
	if (source.startsWith('.')) return placeOf(cwd, resolve(dirname(file), source));
	const prefix = Object.keys(SPECIFIERS).find((p) => source.startsWith(p));
	return prefix ? (SPECIFIERS[prefix] ?? null) : null;
};
