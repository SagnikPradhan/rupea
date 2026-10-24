import type { User } from '#services/auth/application/auth.ts';

type Validated = { value?: unknown; issues?: readonly unknown[] };
type Schema = { '~standard': { validate: (input: unknown) => Validated | Promise<Validated> } };
type Handler = (input: unknown) => unknown;

/** Stands in for $app/server: `vi.mock('$app/server', () => import('#tests/shared/app-server.ts'))`. */
export const request = {
	locals: { user: null as User | null },
	cookies: new Map<string, string>(),
};

const forms = new WeakMap<object, Handler>();

export const getRequestEvent = () => ({
	locals: request.locals,
	cookies: {
		get: (name: string) => request.cookies.get(name),
		set: (name: string, value: string) => request.cookies.set(name, value),
		delete: (name: string) => request.cookies.delete(name),
	},
});

/** Runs lazily, as SvelteKit's does, so a refresh nobody awaits reads nothing. */
export const query = (schema: Schema | Handler, handler?: Handler) =>
	marked('query', (input: unknown) => ({
		then: (done: (v: unknown) => unknown, failed?: (e: unknown) => unknown) =>
			run(schema, handler, input).then(done, failed),
		refresh: () => Promise.resolve(),
	}));

export const command = (schema: Schema | Handler, handler?: Handler) =>
	marked('command', (input: unknown) => run(schema, handler, input));

export const form = (schema: Schema | Handler, handler?: Handler) => {
	const attributes = marked('form', { method: 'POST' });
	forms.set(attributes, (input) => run(schema, handler, input));
	return attributes;
};

/** Submits a form remote with its fields, as the browser would post them. */
export const submit = (remote: object, input?: unknown) =>
	forms.get(remote)?.(input) ?? Promise.reject(new Error('Not a form remote'));

export const signIn = (user: User | null) => {
	request.locals.user = user;
};

const run = async (schema: Schema | Handler, handler: Handler | undefined, input: unknown) => {
	if (typeof schema === 'function') return schema(input);

	const parsed = await schema['~standard'].validate(input);
	if (parsed.issues) return Promise.reject(new Error('Invalid input', { cause: parsed.issues }));

	return handler?.(parsed.value);
};

/** SvelteKit refuses a remote module whose exports lack the marks its own functions carry. */
const marked = <T extends object>(type: string, remote: T) =>
	Object.assign(remote, { __: { type } });
