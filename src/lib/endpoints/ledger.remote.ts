import { replyFrom } from '#lib/server/shared/result/reply.ts';
import * as Ledger from '#services/ledger/application/ledger.ts';
import { query } from '$app/server';
import { Handle, inLedger } from './shared';

export const findFirstDay = query(Handle, (h) =>
	replyFrom(inLedger({ handle: h, action: Ledger.findFirstDay }).map((d) => d?.toString() ?? null)),
);
