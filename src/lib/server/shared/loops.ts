import { setTimeout } from 'node:timers/promises';
import { provide, type RupeaContext } from './context/context';
import type { Logger } from './context/logger';

const FIRST_DELAY = 1_000;
const LONGEST_DELAY = 60_000;

/** Work that runs until the signal aborts. */
export type Loop = (signal: AbortSignal) => Promise<void>;

/** Keeps each loop running in the context, until the stop it returns is called. */
export const startLoops = (context: RupeaContext, loops: Loop[]): (() => Promise<void>) => {
	const controller = new AbortController();
	const signal = controller.signal;
	const running = loops.map((l) =>
		provide(context, () => keepRunning({ loop: l, signal, logger: context.logger })),
	);

	return async () => {
		controller.abort();
		await Promise.all(running);
	};
};

type KeepRunningOptions = {
	loop: Loop;
	signal: AbortSignal;
	logger: Logger;
	/** How many times it has started again, which lengthens the next delay. */
	restarts?: number;
};

/** Runs the loop until the signal aborts, starting it again after a growing delay whenever it stops before. */
const keepRunning = async ({
	loop,
	signal,
	logger,
	restarts = 0,
}: KeepRunningOptions): Promise<void> => {
	const failure = await loop(signal).then(
		() => null,
		(e: unknown) => e,
	);
	if (signal.aborted) return;

	logger.error({ error: failure, loop: loop.name, restarts }, 'loop stopped, starting it again');
	await setTimeout(delayAfter(restarts), undefined, { signal }).catch(() => undefined);
	if (signal.aborted) return;

	return keepRunning({ loop, signal, logger, restarts: restarts + 1 });
};

const delayAfter = (n: number) => Math.min(FIRST_DELAY * 2 ** n, LONGEST_DELAY);
