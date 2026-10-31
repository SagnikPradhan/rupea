import type { User } from '#services/auth/application/auth.ts';

declare global {
	namespace App {
		interface PageData {
			ledgers?: { handle: string; name: string; owned: boolean }[];
		}

		interface Locals {
			user: User | null;
		}
	}
}

export {};
