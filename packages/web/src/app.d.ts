import type { Client } from '@rupea/contract/contract.ts';
import type { User } from '@rupea/contract/route-auth.ts';

declare global {
	namespace App {
		interface Locals {
			api: Client;
			user: User | null;
		}
	}
}

export {};
