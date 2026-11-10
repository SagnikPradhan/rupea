import * as Auth from '#services/auth/application/auth.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import * as Sync from '#services/ledger/application/sync.ts';
import { answer } from './answer.ts';
import { sanitiseBatch } from './sanitise.ts';
import { inLedger, os, signedIn } from './session.ts';

export const listLedgers = os.listLedgers
	.use(signedIn)
	.handler(() =>
		answer(
			Auth.withCurrentUser((u) =>
				Ledger.listLedgers({ user: u.id }).map((l) =>
					l.map((x) => ({ handle: x.handle, name: x.name, owned: x.owner === u.id })),
				),
			),
		),
	);

export const findFirstDay = os.findFirstDay
	.use(signedIn)
	.handler(({ input }) => inLedger({ handle: input.handle, action: Ledger.findFirstDay }));

export const listProblems = os.listProblems
	.use(signedIn)
	.handler(async ({ input }) =>
		sanitiseBatch(await inLedger({ handle: input.handle, action: Sync.listProblems })),
	);

export const findSync = os.findSync
	.use(signedIn)
	.handler(({ input }) => inLedger({ handle: input.handle, action: Sync.findSync }));

export const resync = os.resync.use(signedIn).handler(async ({ input }) => {
	await inLedger({ handle: input.handle, action: Sync.resync });
});
