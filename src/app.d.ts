// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { User } from '#lib/server/services/auth/application/auth.ts';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** The signed-in user, set by `hooks.server.ts`. */
			user: User | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
