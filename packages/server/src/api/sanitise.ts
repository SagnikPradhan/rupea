import { STATUS } from '@rupea/contract/errors.ts';
import { fault, type RupeaError } from '@rupea/shared/error.ts';
import type { Batch } from '@rupea/shared/reply.ts';

/**
 * The error as the client may see it. A 500 becomes a generic error, as the
 * real one names paths and messages of the server.
 */
export const sanitise = (e: RupeaError): RupeaError =>
	STATUS[e.type] === 500 ? fault('UnknownError', { message: 'Internal server error' }) : e;

/** The batch with each error it reports as failed sanitised. */
export const sanitiseBatch = <T>(b: Batch<T>): Batch<T> => ({
	...b,
	failed: b.failed.map(sanitise),
});
