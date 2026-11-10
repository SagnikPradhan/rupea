import * as v from 'valibot';

export const isHandle = (t: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t);

/** A ledger's handle: lowercase words joined by single hyphens. */
export const Handle = v.pipe(v.string(), v.check(isHandle, 'Not a ledger handle.'));
