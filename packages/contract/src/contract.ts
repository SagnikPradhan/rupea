import type { ContractRouterClient } from '@orpc/contract';
import { listWorth } from './accounts.ts';
import { findUser, requestCode, signIn, signOut } from './auth.ts';

export const contract = { listWorth, requestCode, signIn, signOut, findUser };

/** What a client of the contract calls. */
export type Client = ContractRouterClient<typeof contract>;
