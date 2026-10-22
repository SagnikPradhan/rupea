import { withContext } from '#lib/server/shared/context/context.ts';
import { withLogger } from '#lib/server/shared/context/logger.ts';
import { okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import * as DB from '../adapters/database';
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
import type { Ledger } from './ledger';
import { syncIndex } from './sync';

type ClassifyOptions = { embed: Embed; nearest: Nearest; options: ClassifierOptions };

export const classify = ({
	embed,
	nearest,
	options,
}: ClassifyOptions): ResultAsync<Prediction[]> => {
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
export const predictAccounts = <L extends Line>({
	ledger,
	account,
	lines,
}: PredictOptions<L>): ResultAsync<Predicted<L>[]> => {
	if (lines.length === 0) return okAsync([]);

	const predicted = (p: Prediction[]) =>
		lines.map((l, i) => ({ ...l, account: p[i]?.account ?? fallbackAccount(l.amount) }));

	return withContext('models')((models) =>
		withLogger('prediction')((logger) => {
			const nearest: Nearest = (v) => DB.findNearest(ledger.id, MODEL, v);
			return syncIndex(ledger)
				.andThen(() => DB.listAccountNames(ledger.id))
				.andThen((accounts) =>
					classify({
						embed: embedder(models),
						nearest,
						options: {
							thresholds: THRESHOLDS,
							account,
							lines,
							accounts,
							today: Temporal.Now.plainDateISO(),
						},
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
