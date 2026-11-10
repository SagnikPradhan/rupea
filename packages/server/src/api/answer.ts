import { ORPCError } from '@orpc/server';
import { CODE, STATUS } from '@rupea/contract/errors.ts';
import type { Result } from '#lib/server/shared/result/result.ts';
import { sanitise } from './sanitise.ts';

/**
 * The value of a result, or a rejection that answers its failure with the
 * status the contract maps it to. The log gets the real error; the client gets
 * it sanitised.
 */
export const answer = async <T>(result: Result<T> | PromiseLike<Result<T>>): Promise<T> => {
	const settled = await result;
	if (settled.isOk()) return settled.value;

	const error = settled.error;
	const status = STATUS[error.type];

	return Promise.reject(
		new ORPCError(CODE[status], { defined: true, status, data: sanitise(error), cause: error }),
	);
};
