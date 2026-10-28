import { AsyncLocalStorage } from 'node:async_hooks';
import type { Database } from '../../db/index';
import type { RupeaConfiguration } from './config';
import type { Logger } from './logger';
import type { Mailer } from './mailer';
import type { Models } from '../onnx/runtime';
import type { Storages } from '../storage/storage';
import type { Subscription } from '#services/events/application/events.ts';

export type RupeaContext = {
	config: RupeaConfiguration;
	db: Database;
	storages: Storages;
	/** What runs when each event is published. */
	subscriptions: Subscription<unknown>[];
	mailer: Mailer;
	logger: Logger;
	models: Models;
	/** How the server reaches the internet, such as a feed's quotes. */
	fetch: typeof globalThis.fetch;
};

type Key = keyof RupeaContext;

const scope = new AsyncLocalStorage<RupeaContext>();

export const provide = <R>(ctx: RupeaContext, f: () => R): R => scope.run(ctx, f);

export function withContext(): <R>(use: (context: RupeaContext) => R) => R;
export function withContext<K extends Key>(
	key: K,
): <R>(use: (dependency: RupeaContext[K]) => R) => R;
export function withContext<K extends Key>(
	...keys: [K, K, ...K[]]
): <R>(use: (dependencies: Pick<RupeaContext, K>) => R) => R;
export function withContext(...keys: Key[]) {
	return (use: (dependencies: unknown) => unknown) => {
		const context = scope.getStore();
		// Reaching here without `provide` is a wiring bug, not a runtime error.
		// eslint-disable-next-line functional/no-throw-statements -- see above
		if (!context) throw new Error('withContext called outside provide');

		if (keys.length === 0) return use(context);
		if (keys.length === 1) return use(context[keys[0] as Key]);
		return use(Object.fromEntries(keys.map((k) => [k, context[k]])));
	};
}
