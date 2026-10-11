import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { Mail } from '#lib/server/shared/mailer.ts';

export type Server = { url: string; codeFor: (email: string) => Promise<string> };

const CODE = /code is (\w+)/;

const freePort = () =>
	new Promise<number>((done, fail) => {
		const probe = createServer();
		probe.once('error', fail);
		probe.listen(0, '127.0.0.1', () => {
			const address = probe.address();
			probe.close(() => done(typeof address === 'object' && address ? address.port : 0));
		});
	});

const untilUp = async (url: string): Promise<void> => {
	const up = await fetch(url).then(
		() => true,
		() => false,
	);
	if (up) return;
	await new Promise((r) => setTimeout(r, 100));
	return untilUp(url);
};

// The server logs every mail it sends, one JSON object a line, among other
// lines that are not JSON.
const mailIn = (line: string): Mail[] => {
	if (!line.startsWith('{')) return [];

	const entry: unknown = JSON.parse(line);
	return typeof entry === 'object' && entry !== null && 'mail' in entry ? [entry.mail as Mail] : [];
};

const untilMailed = async (mails: Mail[], email: string): Promise<string> => {
	const code = mails.findLast((m) => m.to === email)?.text.match(CODE)?.[1];
	if (code) return code;
	await new Promise((r) => setTimeout(r, 50));
	return untilMailed(mails, email);
};

export const withServer = async (use: (server: Server) => Promise<void>) => {
	const directory = await mkdtemp(join(tmpdir(), 'rupee-e2e-'));
	const port = await freePort();
	const url = `http://127.0.0.1:${port}`;
	const child = spawn('node', ['build'], {
		env: {
			...process.env,
			HOST: '127.0.0.1',
			PORT: String(port),
			// adapter-node assumes https unless a header says otherwise.
			PROTOCOL_HEADER: 'x-forwarded-proto',
			RUPEE_DATA_DIR: directory,
			RUPEE_MODELS: 'verify',
			RUPEE_MODELS_DIR: resolve('data/models'),
			RUPEE_LOG_LEVEL: 'info',
			RUPEE_SIGNUP: 'open',
		},
		stdio: ['ignore', 'pipe', 'inherit'],
	});
	const mails: Mail[] = [];
	createInterface({ input: child.stdout }).on('line', (l) => mails.push(...mailIn(l)));
	await untilUp(url);
	await use({ url, codeFor: (email) => untilMailed(mails, email) });
	child.kill();
	await rm(directory, { recursive: true, force: true });
};
