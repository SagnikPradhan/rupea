import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type AddressInfo, type Server as Probe } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { safely } from '@rupea/server/shared/control.ts';
import type { Mail } from '@rupea/server/shared/context/mailer.ts';

export type Server = { url: string; codeFor: (email: string) => Promise<string> };

const CODE = /code is (\w+)/;

const STARTUP = 120_000;

const freePorts = async (count: number) => {
	const probes = await Promise.all(
		Array.from(
			{ length: count },
			() =>
				new Promise<Probe>((done, fail) => {
					const probe = createServer();
					probe.once('error', fail);
					probe.listen(0, '127.0.0.1', () => done(probe));
				}),
		),
	);
	const ports = probes.map((p) => (p.address() as AddressInfo).port);
	await Promise.all(probes.map((p) => new Promise((done) => p.close(done))));
	return ports;
};

const untilUp = async (url: string, deadline: number): Promise<void> => {
	const up = await fetch(url).then(
		() => true,
		() => false,
	);
	if (up) return;
	if (Date.now() > deadline) return Promise.reject(new Error(`${url} did not answer in time`));
	await new Promise((r) => setTimeout(r, 100));
	return untilUp(url, deadline);
};

const exitedEarly = (child: ChildProcess, name: string) => {
	const early = new Promise<never>((_, fail) =>
		child.once('exit', (code) =>
			fail(new Error(`the ${name} exited with code ${code} before it answered`)),
		),
	);
	early.catch(() => undefined);
	return early;
};

// The server logs every mail it sends, one JSON object a line, among other
// lines that are not JSON.
const mailIn = (line: string): Mail[] => {
	const entry: unknown = safely(() => JSON.parse(line));
	return typeof entry === 'object' && entry !== null && 'mail' in entry ? [entry.mail as Mail] : [];
};

const untilMailed = async (mails: Mail[], email: string): Promise<string> => {
	const code = mails.findLast((m) => m.to === email)?.text.match(CODE)?.[1];
	if (code) return code;
	await new Promise((r) => setTimeout(r, 50));
	return untilMailed(mails, email);
};

const exitOf = (child: ChildProcess) => new Promise((r) => child.once('exit', r));

const baseEnv = () =>
	Object.fromEntries(
		['PATH', 'HOME', 'TMPDIR', 'NODE_V8_COVERAGE']
			.filter((k) => process.env[k] !== undefined)
			.map((k) => [k, process.env[k]]),
	);

export const withServer = async (use: (server: Server) => Promise<void>) => {
	const directory = await mkdtemp(join(tmpdir(), 'rupea-e2e-'));
	const [apiPort, webPort] = await freePorts(2);
	const api = `http://127.0.0.1:${apiPort}`;
	const url = `http://127.0.0.1:${webPort}`;

	const server = spawn('node', ['../server/dist/main.js'], {
		env: {
			...baseEnv(),
			RUPEA_SERVER_HOST: '127.0.0.1',
			RUPEA_SERVER_PORT: String(apiPort),
			RUPEA_STORAGE_FILES: directory,
			RUPEA_MODELS_MODE: 'verify',
			RUPEA_MODELS_DIR: resolve('../server/data/models'),
			RUPEA_LOG_LEVEL: 'info',
			RUPEA_ACCOUNTS_SIGNUP: 'open',
		},
		stdio: ['ignore', 'pipe', 'inherit'],
	});
	const web = spawn('node', ['build'], {
		env: {
			...baseEnv(),
			HOST: '127.0.0.1',
			PORT: String(webPort),
			// adapter-node assumes https unless a header says otherwise.
			PROTOCOL_HEADER: 'x-forwarded-proto',
			RUPEA_API_URL: `${api}/api`,
		},
		stdio: 'inherit',
	});
	const mails: Mail[] = [];
	createInterface({ input: server.stdout }).on('line', (l) => mails.push(...mailIn(l)));

	// Node writes NODE_V8_COVERAGE only once the processes have exited.
	const exited = Promise.all([exitOf(web), exitOf(server)]);

	await Promise.race([
		Promise.all([
			untilUp(`${api}/api/openapi.json`, Date.now() + STARTUP),
			untilUp(url, Date.now() + STARTUP),
		]),
		exitedEarly(server, 'server'),
		exitedEarly(web, 'web app'),
	])
		.then(() => use({ url, codeFor: (email) => untilMailed(mails, email) }))
		.finally(async () => {
			web.kill();
			server.kill();
			await exited;
			await rm(directory, { recursive: true, force: true });
		});
};
