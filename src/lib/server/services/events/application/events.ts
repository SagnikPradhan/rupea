import { withContext } from '#lib/server/shared/context/context.ts';
import { batchAsync } from '#lib/server/shared/result/batch.ts';
import { fault, type RupeaError } from '#lib/server/shared/result/error.ts';
import {
	attempt,
	err,
	ok,
	type Result,
	type ResultAsync,
} from '#lib/server/shared/result/result.ts';
import * as v from 'valibot';

/** Something a service announces it did, named in the past tense, for other services to act on. */
export type Event<P> = {
	name: string;
	payload: v.GenericSchema<unknown, P>;
};

/**
 * Runs in the publisher's process, so work that must outlive it queues a job. Its callback is a
 * method, so a list of `Subscription<unknown>` holds any.
 */
export type Subscription<P> = {
	event: Event<P>;
	run(payload: P, user: string): ResultAsync<void>;
};

type PublishOptions<P> = {
	event: Event<P>;
	user: string;
	payload: P;
};

/** Runs every subscriber for `user`, failing only when the event's own payload does not parse. */
export const publish = <P>({
	event,
	user,
	payload,
}: PublishOptions<P>): ResultAsync<RupeaError[]> =>
	readPayload(event, payload).asyncAndThen((p) =>
		withContext('subscriptions')((subscriptions) =>
			batchAsync(
				subscriptions.filter((s) => s.event.name === event.name).map((s) => run(s, p, user)),
			),
		).map((b) => b.failed),
	);

/** A subscriber that throws fails alone, like one that returns an error. */
const run = <P>(s: Subscription<P>, p: P, u: string): ResultAsync<void> =>
	attempt(() => s.run(p, u)).andThen((r) => r);

const readPayload = <P>(e: Event<P>, payload: P): Result<P> => {
	const parsed = v.safeParse(e.payload, payload);
	if (!parsed.success)
		return err(fault('EventInvalidPayload', { name: e.name, reason: v.summarize(parsed.issues) }));
	return ok(parsed.output);
};
