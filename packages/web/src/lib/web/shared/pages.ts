/**
 * A ledger's pages in the bar, in the order the design draws them, with what
 * each holds. A page is current on any path under it, and its sections are
 * paths in the ledger.
 */
export const PAGES = [
	{
		path: 'spending',
		under: ['spending'],
		icon: 'spending',
		label: 'Spending',
		about: 'Where your income went',
		sections: [],
	},
	{
		path: 'net-worth',
		under: ['net-worth'],
		icon: 'worth',
		label: 'Net worth',
		about: 'What you are worth, and how it has grown',
		sections: [
			{ path: 'net-worth#owned', label: 'Owned' },
			{ path: 'net-worth#owed', label: 'Owed' },
		],
	},
	{
		path: 'transactions',
		under: ['transactions', 'postings', 'files', 'refine'],
		icon: 'ledger',
		label: 'Ledger',
		about: 'Every transaction, and the files they are kept in',
		sections: [
			{ path: 'transactions', label: 'Transactions' },
			{ path: 'postings', label: 'Postings' },
			{ path: 'files', label: 'Files' },
			{ path: 'refine', label: 'Review' },
		],
	},
] as const;
