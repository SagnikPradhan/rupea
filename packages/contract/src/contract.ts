import type { ContractRouterClient } from '@orpc/contract';
import { accounts } from './route-accounts.ts';
import { auth } from './route-auth.ts';
import { files } from './route-files.ts';
import { ledger } from './route-ledger.ts';
import { refinement } from './route-refinement.ts';
import { schemas } from './route-schemas.ts';
import { statements } from './route-statements.ts';
import { transactions } from './route-transactions.ts';

export const contract = {
	accounts,
	auth,
	files,
	ledger,
	refinement,
	schemas,
	statements,
	transactions,
};

/** What a client of the contract calls. */
export type Client = ContractRouterClient<typeof contract>;
