import { isBlank, isComment, isMetadata, isPosting, lines, type RupeeLine } from './parser';

/**
 * Tidies whitespace only: every line keeps its place and meaning, so comments survive.
 * Postings align their amounts, and metadata indents under what it belongs to.
 */
export const format = (content: string): string => {
	const input = lines('', content).map((l) => ({ ...l, content: l.content.trimEnd() }));
	const column = Math.max(0, ...input.filter(isPosting).map((l) => wordsOf(l)[0]?.length ?? 0)) + 2;
	const under = { indent: '' };

	const output = input.map((l) => {
		if (isComment(l)) return l.content;
		if (isBlank(l)) {
			under.indent = '';
			return '';
		}
		if (isMetadata(l)) return under.indent + l.content.trim();
		if (isPosting(l)) {
			under.indent = '\t\t';
			return posting(l, column);
		}

		under.indent = '\t';
		return l.content;
	});
	return squeeze(output);
};

const wordsOf = (l: RupeeLine) => l.content.trim().split(/\s+/);

const posting = (l: RupeeLine, column: number) => {
	const [account = '', ...rest] = wordsOf(l);
	return rest.length === 0 ? `\t${account}` : `\t${account.padEnd(column)}${rest.join(' ')}`;
};

// One blank line between blocks, none at either end.
const squeeze = (output: string[]) => {
	const kept = output.filter((l, i) => l !== '' || (i > 0 && output[i - 1] !== ''));
	const text = kept.join('\n').trimEnd();
	return text === '' ? '' : `${text}\n`;
};
