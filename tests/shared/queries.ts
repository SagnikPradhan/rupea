import type { RupeaError } from '#lib/server/shared/result/error.ts';

/**
 * Stands in for a remote query on a page: awaited for its reply, refreshed for nothing. Typed as
 * never, so it mocks any query without restating SvelteKit's types.
 */
export const answer = (data: unknown, errors: RupeaError[] = []): never => {
	const reply = { ok: errors.length === 0, data, errors };
	return {
		then: (done: (r: typeof reply) => unknown) => Promise.resolve(reply).then(done),
		current: reply,
		refresh: () => Promise.resolve(),
	} as never;
};

type Reply = { ok: boolean; data: unknown; errors: RupeaError[] };
type Form = { result: Reply | undefined; submit: () => Promise<void> };

const replies = new WeakMap<object, Reply>();

/**
 * Stands in for a remote form on a page: its fields render as plain inputs, and submitting it
 * hands the enhance callback the reply given to `respond`.
 */
export const fakeForm = (): never => {
	const field: Record<string, unknown> = { as: attributes, allIssues: () => [] };
	const fields: object = new Proxy({}, { get: (_, key) => field[String(key)] ?? fields });
	const remote = {
		fields,
		pending: 0,
		result: undefined as Reply | undefined,
		enhance: (callback: (f: Form) => Promise<void>) => ({
			onsubmit: (event: SubmitEvent) => {
				event.preventDefault();
				void callback(remote);
			},
		}),
		submit: () => {
			remote.result = replies.get(remote);
			return Promise.resolve();
		},
	};
	return remote as never;
};

/** Sets what a fake form answers when it is next submitted. */
export const respond = (form: object, data: unknown, errors: RupeaError[] = []) =>
	replies.set(form, { ok: errors.length === 0, data, errors });

const attributes = (type: string, value?: unknown) => ({ type: type.split(' ')[0], value });
