import { isCounted, isLedgerFile } from '@rupea/shared/files.ts';

export type Status = 'added' | 'ready' | 'reading' | 'setup' | 'failed' | 'new';

export const STATUSES: Record<Status, { label: string; action?: string }> = {
	added: { label: 'Added to your ledger' },
	ready: { label: 'Ready to review', action: 'Review' },
	reading: { label: 'Reading…' },
	setup: { label: 'Rupea doesn’t recognise this bank yet', action: 'Set up' },
	failed: { label: 'Failed', action: 'Open' },
	new: { label: 'Just uploaded' },
};

/**
 * Where a statement stands: added once a counted file cites it, ready while its
 * draft waits in review, and waiting for setup when its job drafted nothing.
 */
export function statusOf(
	statement: { file: string | null },
	job: { status: string } | undefined,
): Status {
	if (statement.file !== null) return isCounted(statement.file) ? 'added' : 'ready';
	if (job?.status === 'failed') return 'failed';
	if (job?.status === 'queued' || job?.status === 'running') return 'reading';
	if (job?.status === 'succeeded') return 'setup';

	return 'new';
}

/** Whether any uploaded statement is still to be read or reviewed. */
export const isWaitingIn = (
	statements: { key: string; file: string | null }[],
	jobs: { statement: string; status: string }[],
) =>
	statements.some((s) =>
		['new', 'reading', 'ready'].includes(
			statusOf(
				s,
				jobs.find((j) => j.statement === s.key),
			),
		),
	);

/** The account a statement's transactions came from; a ledger file names many. */
export const accountOf = (s: string, f: { postings: { account: string }[] }[]) =>
	isLedgerFile(s) ? undefined : f[0]?.postings[0]?.account;

/**
 * A new home for a statement's transactions: its account's last name and the
 * month they end in, or a ledger file's own name.
 */
export function suggestedFile(
	statement: string,
	found: { date: string; postings: { account: string }[] }[],
) {
	const name = accountOf(statement, found)?.split(':').at(-1)?.toLowerCase();
	const month = found.reduce((m, t) => (t.date > m ? t.date : m), '').slice(0, 7);
	if (name && month) return `${name}/${month}.rupea`;

	return `${statement.replace(/^.*\//, '').replace(/\.[^.]*$/, '')}.rupea`;
}
