/** The text before the first mark, and after it if there is one. */
export const cut = (text: string, mark: string): [string, string | undefined] => {
	const at = text.indexOf(mark);
	return at < 0 ? [text, undefined] : [text.slice(0, at), text.slice(at + 1)];
};

/** Orders strings by UTF-16 code unit, as a bare sort does: the same everywhere, unlike a locale. */
export const byCodeUnit = (a: string, b: string): number => {
	if (a < b) return -1;
	return a > b ? 1 : 0;
};
