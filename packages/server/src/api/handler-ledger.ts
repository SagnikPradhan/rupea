import * as Auth from '#services/auth/application/auth.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import * as Sync from '#services/ledger/application/sync.ts';
import { answer } from './answer.ts';
import { sanitiseBatch } from './sanitise.ts';
import { inLedger, os, signedIn } from './session.ts';

const listLedgers = os.ledger.list
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

const findFirstDay = os.ledger.findFirstDay
	.use(signedIn)
	.handler(({ input }) => inLedger({ handle: input.handle, action: Ledger.findFirstDay }));

const listProblems = os.ledger.listProblems
	.use(signedIn)
	.handler(async ({ input }) =>
		sanitiseBatch(await inLedger({ handle: input.handle, action: Sync.listProblems })),
	);

const findSync = os.ledger.findSync
	.use(signedIn)
	.handler(({ input }) => inLedger({ handle: input.handle, action: Sync.findSync }));

const resync = os.ledger.resync.use(signedIn).handler(async ({ input }) => {
	await inLedger({ handle: input.handle, action: Sync.resync });
});

export const ledger = {
	list: listLedgers,
	findFirstDay,
	listProblems,
	findSync,
	resync,
};
