import { isCounted } from '#lib/shared/folders.ts';
import { isLedgerFile } from '#lib/shared/statements.ts';

export type Status = 'added' | 'ready' | 'reading' | 'setup' | 'failed' | 'new';

export const STATUS_LABELS: Record<Status, string> = {
	added: 'Added',
	ready: 'Ready to add',
	reading: 'Reading…',
	setup: 'Needs setup',
	failed: 'Failed',
	new: 'New',
};

/** Where a statement stands: added once a counted file cites it, ready while its draft waits in review, and waiting for setup when its job drafted nothing. */
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

/** The account a statement's transactions came from; a ledger file names many. */
export const accountOf = (s: string, f: { postings: { account: string }[] }[]) =>
	isLedgerFile(s) ? undefined : f[0]?.postings[0]?.account;

/** A new home for a statement's transactions: its account's last name and the month they end in, or a ledger file's own name. */
export function suggestedFile(
	statement: string,
	found: { date: string; postings: { account: string }[] }[],
) {
	const name = accountOf(statement, found)?.split(':').at(-1)?.toLowerCase();
	const month = found
		.map((t) => t.date)
		.sort()
		.at(-1)
		?.slice(0, 7);
	if (name && month) return `${name}/${month}.rupea`;

	return `${statement.replace(/^.*\//, '').replace(/\.[^.]*$/, '')}.rupea`;
}
