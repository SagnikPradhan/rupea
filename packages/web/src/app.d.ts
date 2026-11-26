import type { Client } from '@rupea/contract/contract.ts';
import type { User } from '@rupea/contract/route-auth.ts';

declare global {
	namespace App {
		interface Locals {
			api: Client;
			user: User | null;
			/** Whether sign-in is off and the user is the one local user. */
			local: boolean;
		}
	}
}

export {};
