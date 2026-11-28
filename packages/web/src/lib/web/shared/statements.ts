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

export const STEPS = ['Uploaded', 'Read', 'Review', 'Added'];

/** The step each status is at; past the last one means all are done. */
export const STEP_AT: Record<Status, number> = {
	new: 1,
	reading: 1,
	setup: 1,
	failed: 1,
	ready: 2,
	added: STEPS.length,
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

const TYPES: Record<string, string> = {
	pdf: 'application/pdf',
	csv: 'text/csv',
	xls: 'application/vnd.ms-excel',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const extensionOf = (s: string) => s.split('.').pop()?.toLowerCase() ?? '';

/** Whether the browser can show the original statement itself. */
export const isShowable = (s: string) => extensionOf(s) === 'pdf';

/**
 * The headers that serve an original statement: shown inline when a browser
 * can, else saved.
 */
export const headersForOriginal = (s: string) => ({
	'Content-Type': TYPES[extensionOf(s)] ?? 'application/octet-stream',
	'Content-Disposition': `${isShowable(s) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(s.split('/').pop() ?? s)}`,
	'X-Content-Type-Options': 'nosniff',
	'Cache-Control': 'private',
});
