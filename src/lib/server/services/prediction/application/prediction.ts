import { syncIndex, withLedger } from '#services/ledger/application/ledger.ts';
import { withContext } from '#lib/server/shared/context.ts';
import { withLogger } from '#lib/server/shared/logger.ts';
import { okAsync, type ResultAsync } from '#lib/server/shared/result.ts';
import { history } from '../adapters/database';
import { embedder, MODEL } from '../adapters/onnx';
import {
	classifier,
	fallback,
	filling,
	type ClassifierOptions,
	type Embed,
	type History,
	type Line,
	type Nearest,
	type Prediction,
} from '../domain/prediction';

// Past transactions embedded per prediction, latest first, so a large ledger
// catches up over a few imports instead of stalling one.
const FILL = 500;

export const classify = (
	embed: Embed,
	nearest: Nearest,
	options: ClassifierOptions,
): ResultAsync<Prediction[]> => {
	const c = classifier(options);
	return embed(c.texts).andThen((v) => nearest(c.asked(v)).map((n) => c.classify(v, n)));
};

export const fillHistory = (embed: Embed, h: History): ResultAsync<void> =>
	h.unembedded(FILL).andThen((rows) => {
		if (rows.length === 0) return okAsync(undefined);

		const f = filling(rows);
		const embedded = f.texts.length === 0 ? okAsync([]) : embed(f.texts);
		return embedded.andThen((v) => h.fill(f.fill(v)));
	});

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
			syncIndex(userId)
				.andThen(() =>
					withLedger(userId, (ledgerId) => {
						const embed = embedder(models);
						const h = history(ledgerId, MODEL);
						return fillHistory(embed, h)
							.andThen(h.accounts)
							.andThen((accounts) =>
								classify(embed, h.nearest, {
									thresholds: config.prediction,
									account,
									lines,
									accounts,
									today: Temporal.Now.plainDateISO(),
								}),
							);
					}),
				)
				.andTee((p) => logger.debug({ account, predictions: p }, 'accounts predicted'))
				.orElse((error) => {
					logger.warn({ error }, 'accounts not predicted');
					return okAsync(lines.map((l) => fallback(l.amount)));
				}),
		),
	);
};
