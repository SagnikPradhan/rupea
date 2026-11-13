import type { Client } from '@rupea/contract/contract.ts';
import type { User } from '@rupea/contract/auth.ts';

declare global {
	namespace App {
		interface Locals {
			api: Client;
			user: User | null;
		}
	}
}

export {};
