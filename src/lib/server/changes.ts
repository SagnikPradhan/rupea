import { followChanges } from '#services/ledger/application/changes.ts';
import { provide, type RupeaContext } from './shared/context/context';

/** Follows changes to storage, so ledgers sync when their files change; a dev reload stops the last reload's. */
export const startFollowing = (context: RupeaContext) => {
	import.meta.hot?.data.stopFollowing?.();

	const controller = new AbortController();
	const stop = () => controller.abort();
	void provide(context, () => followChanges(controller.signal)).catch((e: unknown) =>
		context.logger.error({ error: e }, 'storage changes not followed'),
	);

	if (import.meta.hot) import.meta.hot.data.stopFollowing = stop;
	return { stop };
};
