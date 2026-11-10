import * as v from 'valibot';

/** An email address, trimmed and lower-cased, as an account is found by it. */
export const Email = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.email('Enter a valid email address.'),
);
