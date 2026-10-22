import { withContext } from '#lib/server/shared/context/context.ts';
import { withLogger } from '#lib/server/shared/context/logger.ts';
import { okAsync, type ResultAsync } from '#lib/server/shared/result/result.ts';
import * as DB from '../adapters/database';
import { embedTexts, MODEL } from '../adapters/prediction-onnx';
import {
	classify,
	fallback,
	fallbackAccount,
	textsOf,
	THRESHOLDS,
	type ClassifyOptions,
	type Line,
	type Prediction,
} from '../domain/prediction';
import type { Ledger } from './ledger';
import { syncIndex } from './sync';

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

	return withLogger('prediction')((logger) =>
		syncIndex(ledger)
			.andThen(() => DB.listAccountNames(ledger.id))
			.andThen((accounts) =>
				guess(ledger, {
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
			.map(predicted),
	);
};

/** The searched texts come first, so their vectors are the first ones. */
const guess = (ledger: Ledger, o: ClassifyOptions): ResultAsync<Prediction[]> =>
	withContext('models')((models) => {
		const t = textsOf(o);
		return embedTexts(models, t.texts).andThen((v) =>
			DB.findNearest(ledger.id, MODEL, v.slice(0, t.searched)).map((n) => classify(o, v, n)),
		);
	});
