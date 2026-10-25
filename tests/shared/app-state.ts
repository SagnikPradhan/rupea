/** Stands in for $app/state: `vi.mock('$app/state', () => import('#tests/shared/app-state.ts'))`. */
const current = { url: new URL('https://rupea.test/') };

export const page = {
	get url() {
		return current.url;
	},
};

/** Puts the page at a path, as navigating there would, before it renders. */
export const visit = (path: string) => {
	current.url = new URL(path, 'https://rupea.test');
};

/** What the layouts hand a ledger's pages: a signed-in user looking at the ledger `h`. */
export const data = {
	user: { username: 'asha' },
	theme: 'system' as const,
	ledgers: [],
	ledger: { handle: 'h', name: 'Home' },
};
