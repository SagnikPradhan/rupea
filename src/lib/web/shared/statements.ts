import { isCounted } from '#lib/shared/folders.ts';

export type Status = 'added' | 'ready' | 'reading' | 'failed' | 'new';

export const STATUS_LABELS: Record<Status, string> = {
	added: 'Added',
	ready: 'Ready to add',
	reading: 'Reading…',
	failed: 'Failed',
	new: 'New',
};

/** Where a statement stands: added once a counted file cites it, ready while its draft waits in review. */
export function statusOf(
	statement: { file: string | null },
	job: { status: string } | undefined,
): Status {
	if (statement.file !== null) return isCounted(statement.file) ? 'added' : 'ready';
	if (job?.status === 'failed') return 'failed';
	if (job?.status === 'queued' || job?.status === 'running') return 'reading';

	return 'new';
}

/** A home in the ledger for a statement's transactions: its name, without its day or extension. */
export const suggestedFile = (s: string) =>
	`${s.replace(/^.*\//, '').replace(/\.[^.]*$/, '')}.rupea`;
