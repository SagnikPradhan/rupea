import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

type Line = { kind: 'header' | 'posting' | 'metadata' | 'comment' | 'other'; account: boolean };

const DATE = /^\d{4}-\d{2}-\d{2}/;
const TIME = /^\d{2}:\d{2}(:\d{2})?/;
const NUMBER = /^[+-]?[\d,]+(\.\d+)?/;
const KEY = /^-\s+[^\s:]+:/;

/** Mirrors the line kinds the ledger parser tells apart; it only colours, never validates. */
const language = StreamLanguage.define<Line>({
	startState: () => ({ kind: 'other', account: false }),
	token: (stream, line) => {
		if (stream.sol()) Object.assign(line, { kind: kindOf(stream.string), account: false });
		if (stream.eatSpace()) return null;

		if (line.kind === 'comment') return skip(stream, 'comment');
		if (line.kind === 'metadata') return stream.match(KEY) ? 'meta' : skip(stream, 'string');
		if (line.kind === 'header')
			return stream.match(DATE) || stream.match(TIME) ? 'keyword' : skip(stream, null);
		if (line.kind === 'posting' && !line.account) {
			line.account = true;
			return stream.match(/^\S+/) ? 'variableName' : null;
		}

		if (stream.match(/^@@?|^=/)) return 'operator';
		if (stream.match(NUMBER)) return 'number';
		stream.match(/^\S+/);
		return 'atom';
	},
});

const style = HighlightStyle.define([
	{ tag: tags.keyword, color: 'var(--color-accent)' },
	{ tag: tags.number, color: 'var(--color-ink)' },
	{ tag: tags.variableName, color: 'var(--color-ink)' },
	{ tag: [tags.atom, tags.operator, tags.meta, tags.string], color: 'var(--color-muted)' },
	{ tag: tags.comment, color: 'var(--color-muted)', fontStyle: 'italic' },
]);

export const ledger = [language, syntaxHighlighting(style)];

const kindOf = (text: string): Line['kind'] => {
	if (text.startsWith(';')) return 'comment';
	if (/^\s*-(\s|$)/.test(text)) return 'metadata';
	if (/^(\t| {2})/.test(text)) return 'posting';
	if (DATE.test(text)) return 'header';
	return 'other';
};

const skip = (stream: { skipToEnd: () => void }, token: string | null) => {
	stream.skipToEnd();
	return token;
};
