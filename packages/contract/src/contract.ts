import type { ContractRouterClient } from '@orpc/contract';
import * as accounts from './accounts.ts';
import * as files from './files.ts';
import { findUser, requestCode, signIn, signOut } from './auth.ts';
import * as ledger from './ledger.ts';
import * as refinement from './refinement.ts';
import * as schemas from './schemas.ts';
import * as statements from './statements.ts';
import * as transactions from './transactions.ts';

export const contract = {
	...accounts,
	requestCode,
	signIn,
	signOut,
	findUser,
	...files,
	...ledger,
	...refinement,
	...schemas,
	...statements,
	...transactions,
};

/** What a client of the contract calls. */
export type Client = ContractRouterClient<typeof contract>;
