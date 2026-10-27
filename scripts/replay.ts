import { readConfiguration } from '#lib/server/shared/context/config.ts';
import { createLogger } from '#lib/server/shared/context/logger.ts';
import { textEmbedding, textTokenizer } from '#lib/server/shared/onnx/models.ts';
import { createModels } from '#lib/server/shared/onnx/runtime.ts';
import { embedTexts } from '#services/ledger/adapters/prediction-model2vec.ts';
import { parse } from '#services/ledger/domain/parser.ts';
import {
	classify,
	textsOf,
	THRESHOLDS,
	type Neighbour,
	type Prediction,
} from '#services/ledger/domain/prediction.ts';
import { clean } from '#services/ledger/domain/text.ts';
import type { RupeaTransaction } from '#services/ledger/domain/types.ts';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const NEAREST = 50;

const args = parseArgs({
	allowPositionals: true,
	options: { cold: { type: 'boolean', default: false } },
});
const root = resolve(args.positionals[0] ?? '.');
const cold = args.values.cold;
const config = readConfiguration(process.env);

const logger = createLogger(config.log.level, process.stdout.isTTY);
const models = createModels({
	directory: resolve(config.models.dir),
	files: [textEmbedding, textTokenizer],
	threads: 1,
	mode: 'download',
	logger,
});

/** One file of the ledger, read as a statement of the account most of its postings name. */
type Statement = { account: string; first: string; transactions: RupeaTransaction[] };

/** A past transaction, as the index would find it near a line. */
type Remembered = { vector: Float32Array; transaction: RupeaTransaction };

const statements = (await readStatements(root)).toSorted((a, b) => a.first.localeCompare(b.first));
const accounts = [...new Set(statements.flatMap((s) => s.transactions.flatMap(accountsOf)))];

const history: Remembered[] = [];
const outcomes: { right: boolean; source: Prediction['source'] }[] = [];
for (const statement of statements) {
	outcomes.push(...(await predictStatement(statement)));
	if (!cold) history.push(...(await remember(statement.transactions)));
}

const right = outcomes.filter((o) => o.right).length;
const guessed = outcomes.filter((o) => o.source !== 'fallback');
const share = (n: number, t: number) => `${((100 * n) / t).toFixed(1)}%`;

console.table({
	lines: outcomes.length,
	right: share(right, outcomes.length),
	guessed: share(guessed.length, outcomes.length),
	precision: share(guessed.filter((o) => o.right).length, guessed.length),
});

/** Predicts each line of a statement from the statements before it, as an import would. */
async function predictStatement(statement: Statement) {
	const lines = statement.transactions.flatMap((t) => lineOf(statement.account, t));
	if (lines.length === 0 || (!cold && history.length === 0)) return [];

	const options = {
		thresholds: THRESHOLDS,
		account: statement.account,
		lines,
		accounts,
		today: Temporal.PlainDate.from(statement.first),
	};
	const texts = textsOf(options);
	const vectors = await embed(texts.texts);
	const nearest = vectors.slice(0, texts.searched).map(nearestTo);

	return classify(options, vectors, nearest).map((p, i) => ({
		right: p.account === lines[i]?.truth,
		source: p.source,
	}));
}

/** A transaction between the statement's account and one other, with the other as the answer. */
function lineOf(account: string, t: RupeaTransaction) {
	const own = t.postings.find((p) => p.account === account);
	const other = t.postings.find((p) => p.account !== account);
	if (t.postings.length !== 2 || !own || !other) return [];

	return [{ amount: own.amount, description: t.description, truth: other.account }];
}

async function remember(transactions: RupeaTransaction[]) {
	const described = transactions.filter((t) => clean(t.description) !== '');
	const vectors = await embed(described.map((t) => clean(t.description)));
	return described.map((transaction, i) => ({
		vector: vectors[i] ?? new Float32Array(),
		transaction,
	}));
}

/** What the index's nearest search returns: every posting of the closest transactions. */
function nearestTo(vector: Float32Array): Neighbour[] {
	return history
		.map((h) => ({ h, similarity: h.vector.reduce((s, v, i) => s + v * (vector[i] ?? 0), 0) }))
		.sort((a, b) => b.similarity - a.similarity)
		.slice(0, NEAREST)
		.flatMap(({ h, similarity }) =>
			h.transaction.postings.map((p) => ({
				account: p.account,
				amount: p.amount,
				date: h.transaction.date,
				similarity,
			})),
		);
}

async function embed(texts: string[]) {
	const result = await embedTexts(models, texts);
	if (result.isErr()) {
		logger.error({ error: result.error }, 'texts not embedded');
		process.exit(1);
	}

	return result.value;
}

async function readStatements(directory: string): Promise<Statement[]> {
	const paths = (await readdir(directory, { recursive: true }))
		.filter((p) => p.endsWith('.rupea'))
		.map((p) => join(directory, p));

	const files = await Promise.all(
		paths.map(async (p) => ({ key: relative(directory, p), content: await readFile(p, 'utf8') })),
	);
	return files.flatMap((f) => statementOf(parse(config.ledger, f).succeeded));
}

function statementOf(transactions: RupeaTransaction[]): Statement[] {
	const named = Object.groupBy(transactions.flatMap(accountsOf), (a) => a);
	const account = Object.entries(named).toSorted(
		(a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0),
	)[0]?.[0];
	const first = transactions
		.map((t) => t.date)
		.toSorted(Temporal.PlainDate.compare)[0]
		?.toString();
	if (!account || !first) return [];

	return [{ account, first, transactions }];
}

function accountsOf(t: RupeaTransaction) {
	return t.postings.map((p) => p.account);
}
