import { withContext } from '#lib/server/shared/context/context.ts';
import { withLogger } from '#lib/server/shared/context/logger.ts';
import { okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import type { Ledger } from './ledger';
import { syncIndex } from './sync';
import { history } from '../adapters/prediction';
import { embedder, MODEL } from '../adapters/prediction-onnx';
import {
	classifier,
	fallback,
	fallbackAccount,
	THRESHOLDS,
	type ClassifierOptions,
	type Embed,
	type Line,
	type Nearest,
	type Prediction,
} from '../domain/prediction';

export const classify = (
	embed: Embed,
	nearest: Nearest,
	options: ClassifierOptions,
): ResultAsync<Prediction[]> => {
	const c = classifier(options);
	return embed(c.texts).andThen((v) => nearest(c.asked(v)).map((n) => c.classify(v, n)));
};

type PredictOptions<L extends Line> = {
	ledger: Ledger;
	account: string;
	lines: L[];
};

export type Predicted<L extends Line> = L & { account: string };

// Every line gets an account, Uncategorized when nothing better is known.
export const predictAccounts = <L extends Line>(
	options: PredictOptions<L>,
): ResultAsync<Predicted<L>[]> => {
	const { ledger, account, lines } = options;
	if (lines.length === 0) return okAsync([]);

	const predicted = (p: Prediction[]) =>
		lines.map((l, i) => ({ ...l, account: p[i]?.account ?? fallbackAccount(l.amount) }));

	return withContext('models')((models) =>
		withLogger('prediction')((logger) => {
			const h = history(ledger.id, MODEL);
			return syncIndex(ledger)
				.andThen(h.accounts)
				.andThen((accounts) =>
					classify(embedder(models), h.nearest, {
						thresholds: THRESHOLDS,
						account,
						lines,
						accounts,
						today: Temporal.Now.plainDateISO(),
					}),
				)
				.andTee((p) => logger.debug({ account, predictions: p }, 'accounts predicted'))
				.orElse((error) => {
					logger.warn({ error }, 'accounts not predicted');
					return okAsync(lines.map((l) => fallback(l.amount)));
				})
				.map(predicted);
		}),
	);
};
