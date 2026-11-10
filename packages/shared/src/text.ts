/**
 * Orders strings by UTF-16 code unit, as a bare sort does: the same everywhere,
 * unlike a locale.
 */
export const byCodeUnit = (a: string, b: string): number => {
	if (a < b) return -1;
	return a > b ? 1 : 0;
};
