import { OpenAPIGenerator } from '@orpc/openapi';
import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { ORPCError } from '@orpc/server';
import { contract } from '@rupea/contract/contract.ts';
import { RupeaError } from '@rupea/shared/error.ts';
import Fastify, { type FastifyBaseLogger, type FastifyError, type FastifyRequest } from 'fastify';
import * as Auth from '#services/auth/application/auth.ts';
import { provide, type RupeaContext } from '#lib/server/shared/context/context.ts';
import { converter } from './converter.ts';
import { accounts } from './handler-accounts.ts';
import { auth } from './handler-auth.ts';
import { files } from './handler-files.ts';
import { ledger } from './handler-ledger.ts';
import { refinement } from './handler-refinement.ts';
import { schemas } from './handler-schemas.ts';
import { statements } from './handler-statements.ts';
import { transactions } from './handler-transactions.ts';
import { os } from './session.ts';

const router = os.router({
	accounts,
	auth,
	files,
	ledger,
	refinement,
	schemas,
	statements,
	transactions,
});

/**
 * The largest body a request may carry, as many statements may arrive at once.
 * It equals the upload limit of the web app. The host counts the bytes it reads
 * and refuses the rest, whatever the length header says.
 */
const BODY_LIMIT = 64 * 1024 * 1024;

/**
 * The largest body a request may carry without a session, so a stranger cannot
 * make the host buffer more than a sign-in needs.
 */
const SIGNED_OUT_BODY_LIMIT = 1024 * 1024;

type Issue = { expected: string | null; path?: { key: unknown }[] | undefined };

const CLIENT_FAULT = { code: 'BAD_REQUEST', message: 'Invalid request' };
const SERVER_FAULT = { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' };

const REFUSALS: Record<number, { code: string; message: string }> = {
	401: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
	404: { code: 'NOT_FOUND', message: 'Not found' },
	413: { code: 'PAYLOAD_TOO_LARGE', message: 'Body too large' },
	415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Send application/json' },
};

const REDACTED = [
	'headers.authorization',
	'headers.cookie',
	'*.headers.authorization',
	'*.headers.cookie',
	'*.*.headers.authorization',
	'*.*.headers.cookie',
];

const info = { title: 'Rupea', version: '0' };

type Operation = { requestBody?: { content?: Record<string, unknown> } };

const uploadsAsForms = (document: { paths?: Record<string, unknown> | undefined }) => {
	const forms = structuredClone(document);
	const operations = Object.values(forms.paths ?? {}).flatMap((p): Operation[] =>
		Object.values(p as Record<string, Operation>),
	);

	for (const content of operations.map((o) => o.requestBody?.content))
		if (content && 'multipart/form-data' in content) delete content['application/json'];

	return forms;
};

const issueOf = ({ expected, path }: Issue) => ({
	path: (path ?? []).map((p) => String(p.key)),
	message: expected ? `Expected ${expected}` : 'Invalid value',
});

const refusal = (status: number) => {
	const { code, message } = REFUSALS[status] ?? (status >= 500 ? SERVER_FAULT : CLIENT_FAULT);

	return new ORPCError(code, { status, message }).toJSON();
};

const refuseInput = (e: ORPCError<string, unknown>) => {
	const issues = (e.data as { issues?: Issue[] } | undefined)?.issues;
	const data = Array.isArray(issues) ? { issues: issues.map(issueOf) } : undefined;

	return new ORPCError('BAD_REQUEST', { message: 'Invalid input', data });
};

const isBadInput = (e: unknown): e is ORPCError<string, unknown> =>
	e instanceof ORPCError && e.code === 'BAD_REQUEST';

const isServerFault = (e: unknown) => !(e instanceof ORPCError) || e.status >= 500;

const guard = ({
	next,
	context,
}: {
	next: () => Promise<unknown>;
	context: { log: FastifyBaseLogger };
}) =>
	next().catch((e: unknown) => {
		if (isBadInput(e)) throw refuseInput(e);
		if (isServerFault(e)) context.log.error({ err: e }, 'request failed');
		throw e;
	});

const formOf = (req: FastifyRequest, body: Buffer) =>
	new Response(new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.length), {
		headers: { 'content-type': req.headers['content-type'] ?? '' },
	})
		.formData()
		.catch(() => {
			throw Object.assign(new Error('Invalid form'), { statusCode: 400 });
		});

const bearerOf = (req: FastifyRequest) =>
	/^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1] ?? null;

const hasSession = async (context: RupeaContext, req: FastifyRequest) => {
	const token = bearerOf(req);
	if (!token) return false;

	const found = await provide(context, () => Auth.findSession(token));
	if (found.isErr()) throw new Error('session lookup failed', { cause: found.error });

	return found.value !== null;
};

const hasBody = (req: FastifyRequest) =>
	req.headers['content-length'] !== undefined || req.headers['transfer-encoding'] !== undefined;

const isLargeBody = (req: FastifyRequest) =>
	Number(req.headers['content-length'] ?? Infinity) > SIGNED_OUT_BODY_LIMIT;

const isTooLargeBody = (req: FastifyRequest) =>
	Number(req.headers['content-length'] ?? 0) > BODY_LIMIT;

/**
 * The HTTP host: each route of the contract, with a document that describes
 * them.
 */
export const createApi = async (context: RupeaContext) => {
	const handler = new OpenAPIHandler(router, { clientInterceptors: [guard] });
	const generated = await new OpenAPIGenerator({
		schemaConverters: [converter],
	}).generate(contract, {
		info,
		servers: [{ url: '/api' }],
		commonSchemas: { RupeaError: { schema: RupeaError } },
	});

	const document = uploadsAsForms(generated);

	const logger = context.logger.child({}, { redact: REDACTED });
	const api = Fastify({ loggerInstance: logger, bodyLimit: BODY_LIMIT });
	api.removeAllContentTypeParsers();
	api.addContentTypeParser('multipart/form-data', { parseAs: 'buffer' }, formOf);
	api.addContentTypeParser('*', { parseAs: 'buffer' }, (_, body, done) =>
		done(
			body.length === 0 ? null : Object.assign(new Error('Unsupported'), { statusCode: 415 }),
			undefined,
		),
	);
	const parseJson = api.getDefaultJsonParser('error', 'error');
	api.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
		if (body === '') return done(null, undefined);
		void parseJson(req, String(body), (e, p) =>
			done(e ? Object.assign(new Error('Invalid JSON'), { statusCode: 400 }) : null, p),
		);
	});

	api.setErrorHandler((error: FastifyError, req, res) => {
		const status = error.statusCode ?? 500;
		if (status >= 500) req.log.error({ err: error, reqId: req.id }, 'request failed');

		return res.code(status).send(refusal(status));
	});

	api.addHook('onRequest', async (req, res) => {
		const length = req.headers['content-length'];
		if (length !== undefined && !/^\d+$/.test(length)) return res.code(400).send(refusal(400));
		if (isTooLargeBody(req)) return res.code(413).send(refusal(413));
		if (!hasBody(req) || !isLargeBody(req)) return;

		if (!(await hasSession(context, req))) return res.code(401).send(refusal(401));
	});

	api.addHook('onSend', async (req, res) => {
		if (/^\/api\/auth(\/|\?|$)/.test(req.url)) res.header('cache-control', 'no-store');
	});

	api.get('/api/openapi.json', () => document);
	api.all('/api/*', (req, res) =>
		provide(context, async () => {
			const handled = await handler.handle(req, res, {
				prefix: '/api',
				context: { token: bearerOf(req), log: req.log },
			});
			if (!handled.matched) res.code(404).send(refusal(404));
		}),
	);

	return api;
};
