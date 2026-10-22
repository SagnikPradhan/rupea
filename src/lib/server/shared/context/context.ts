import { AsyncLocalStorage } from 'node:async_hooks';
import type { Database } from '../../db/index';
import type { RupeeConfiguration } from './config';
import type { Logger } from './logger';
import type { Mailer } from './mailer';
import type { Models } from '../onnx/runtime';
import type { Storages } from '../storage/storage';

export type RupeeContext = {
	config: RupeeConfiguration;
	db: Database;
	storages: Storages;
	mailer: Mailer;
	logger: Logger;
	models: Models;
	/** How the server reaches the internet, such as a feed's quotes. */
	fetch: typeof globalThis.fetch;
};

type Key = keyof RupeeContext;

const scope = new AsyncLocalStorage<RupeeContext>();

export const provide = <R>(ctx: RupeeContext, f: () => R): R => scope.run(ctx, f);

export function withContext(): <R>(use: (context: RupeeContext) => R) => R;
export function withContext<K extends Key>(
	key: K,
): <R>(use: (dependency: RupeeContext[K]) => R) => R;
export function withContext<K extends Key>(
	...keys: [K, K, ...K[]]
): <R>(use: (dependencies: Pick<RupeeContext, K>) => R) => R;
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
