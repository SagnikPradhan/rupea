import { OpenAPIGenerator } from '@orpc/openapi';
import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { ORPCError } from '@orpc/server';
import { contract } from '@rupea/contract/contract.ts';
import { RupeaError } from '@rupea/shared/error.ts';
import Fastify, { type FastifyBaseLogger, type FastifyError, type FastifyRequest } from 'fastify';
import { provide, type RupeaContext } from '#lib/server/shared/context/context.ts';
import { converter } from './converter.ts';
import { listWorth } from './accounts.ts';
import { findUser, requestCode, signIn, signOut } from './auth.ts';
import { os } from './session.ts';

const router = os.router({ listWorth, requestCode, signIn, signOut, findUser });

/**
 * The largest body a request may carry, as many statements may arrive at once.
 * It equals the upload limit of the web app. The host counts the bytes it reads
 * and refuses the rest, whatever the length header says.
 */
const BODY_LIMIT = 64 * 1024 * 1024;

type Issue = { expected: string | null; path?: { key: unknown }[] | undefined };

const REFUSALS: Record<number, { code: string; message: string }> = {
	400: { code: 'BAD_REQUEST', message: 'Invalid request' },
	404: { code: 'NOT_FOUND', message: 'Not found' },
	413: { code: 'PAYLOAD_TOO_LARGE', message: 'Body too large' },
	415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Send application/json' },
	500: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
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

const describe = ({ expected, path }: Issue) => ({
	path: (path ?? []).map((p) => String(p.key)),
	message: expected ? `Expected ${expected}` : 'Invalid value',
});

const refusal = (status: number) => {
	const known = REFUSALS[status] ?? (status >= 500 ? REFUSALS[500] : REFUSALS[400]);
	const { code, message } = known ?? { code: 'BAD_REQUEST', message: 'Invalid request' };

	return new ORPCError(code, { status, message }).toJSON();
};

const refuseInput = (e: ORPCError<string, unknown>) => {
	const issues = (e.data as { issues?: Issue[] } | undefined)?.issues;
	const data = Array.isArray(issues) ? { issues: issues.map(describe) } : undefined;

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
		if (isBadInput(e)) return Promise.reject(refuseInput(e));
		if (isServerFault(e)) context.log.error({ err: e }, 'request failed');
		return Promise.reject(e);
	});

const bearerOf = (req: FastifyRequest) =>
	/^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1] ?? null;

/**
 * The HTTP host: each route of the contract, with a document that describes
 * them.
 */
export const createApi = async (context: RupeaContext) => {
	const handler = new OpenAPIHandler(router, { clientInterceptors: [guard] });
	const document = await new OpenAPIGenerator({
		schemaConverters: [converter],
	}).generate(contract, {
		info,
		servers: [{ url: '/api' }],
		commonSchemas: { RupeaError: { schema: RupeaError } },
	});

	const logger = context.logger.child({}, { redact: REDACTED });
	const api = Fastify({ loggerInstance: logger, bodyLimit: BODY_LIMIT });
	api.removeAllContentTypeParsers();
	api.addContentTypeParser('multipart/form-data', { parseAs: 'buffer' }, (_, b, d) => d(null, b));
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
