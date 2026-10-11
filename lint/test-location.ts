import { basename, dirname } from 'node:path';
import { ESLintUtils } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator.withoutDocs;
const description = 'Keep tests in the tests folder of their module';
const message = 'Move this test into the tests folder at the root of its module';

export const testLocation = createRule({
	meta: {
		type: 'problem',
		docs: { description },
		schema: [],
		messages: { misplaced: message },
	},
	defaultOptions: [],

	create(context) {
		const file = context.filename;
		if (basename(dirname(file)) === 'tests') return {};

		return {
			Program: (n) => context.report({ node: n, messageId: 'misplaced' }),
		};
	},
});
