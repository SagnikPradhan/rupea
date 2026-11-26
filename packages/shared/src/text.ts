import * as v from 'valibot';

/**
 * Orders strings by UTF-16 code unit, as a bare sort does: the same everywhere,
 * unlike a locale.
 */
export const byCodeUnit = (a: string, b: string): number => {
	if (a < b) return -1;
	return a > b ? 1 : 0;
};

export const isHandle = (t: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t);

/** A ledger's handle: lowercase words joined by single hyphens. */
export const Handle = v.pipe(v.string(), v.check(isHandle, 'Not a ledger handle.'));

/** A username: lower-case letters, digits and dashes, as the ones made up are. */
export const Username = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.regex(/^[a-z0-9-]{3,32}$/, 'Use 3 to 32 letters, digits or dashes.'),
);

/** An email address, trimmed and lower-cased, as an account is found by it. */
export const Email = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.email('Enter a valid email address.'),
);
