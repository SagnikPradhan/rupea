import * as v from 'valibot';
import { Key, Line } from './files.ts';

/** Whether a member of a group counts, or only backs up the one that does. */
export const Role = v.picklist(['primary', 'evidence']);

/** A group's name is one word. */
export const GroupId = v.pipe(
	v.string(),
	v.regex(/^\S+$/, 'A group id is one word.'),
	v.maxLength(256),
);

/** What a suggestion is known by, so a dismissal can name it. */
export const Fingerprint = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/));

/** Where a link line goes, and what the header there must still say. */
export const LinkTarget = v.object({
	file: Key,
	line: Line,
	date: v.string(),
	description: v.string(),
	role: Role,
});

/** A link line to write, naming the group it joins. */
export const LinkEdit = v.object({ ...LinkTarget.entries, group: GroupId });
