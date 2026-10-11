import { getTransactions, withLedger } from '#services/ledger/application/ledger.ts';
import { withContext } from '#lib/server/shared/context.ts';
import { withLogger } from '#lib/server/shared/logger.ts';
import { okAsync, type ResultAsync } from '#lib/server/shared/result.ts';
import { embeddings } from '../adapters/database';
import { embedder, MODEL } from '../adapters/onnx';
import { remembering } from '../domain/remembering';
import {
	classifier,
	fallback,
	type ClassifierOptions,
	type Embed,
	type Line,
	type Prediction,
} from '../domain/prediction';

export const classify = (embed: Embed, options: ClassifierOptions): ResultAsync<Prediction[]> => {
	const c = classifier(options);
	return embed(c.texts).map(c.classify);
};

type PredictOptions = {
	userId: string;
	account: string;
	lines: Line[];
};

export const predictAccounts = (options: PredictOptions): ResultAsync<Prediction[]> => {
	const { userId, account, lines } = options;
	if (lines.length === 0) return okAsync([]);
	return withContext(
		'config',
		'models',
	)(({ config, models }) =>
		withLogger('prediction')((logger) =>
			withLedger(userId, (ledgerId) =>
				getTransactions(userId).andThen((history) =>
					classify(remembering(embedder(models), embeddings(ledgerId, MODEL)), {
						thresholds: config.prediction,
						account,
						lines,
						transactions: history.succeeded,
						today: Temporal.Now.plainDateISO(),
					}),
				),
			)
				.andTee((p) => logger.debug({ account, predictions: p }, 'accounts predicted'))
				.orElse((error) => {
					logger.warn({ error }, 'accounts not predicted');
					return okAsync(lines.map((l) => fallback(l.amount)));
				}),
		),
	);
};
