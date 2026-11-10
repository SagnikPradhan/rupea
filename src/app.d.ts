import type { User } from '@rupea/server/services/auth/application/auth.ts';

declare global {
	namespace App {
		interface Locals {
			user: User | null;
		}
	}
}

export {};
