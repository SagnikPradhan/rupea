/** The text before the first mark, and after it if there is one. */
export const cut = (text: string, mark: string): [string, string | undefined] => {
	const at = text.indexOf(mark);
	return at < 0 ? [text, undefined] : [text.slice(0, at), text.slice(at + 1)];
};
