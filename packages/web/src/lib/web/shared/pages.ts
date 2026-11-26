/**
 * A ledger's pages in the bar, in the order the design draws them, with what
 * each holds.
 */
export const PAGES = [
	{
		path: 'spending',
		label: 'Spending',
		about: 'What came in, and where it went',
		sections: [
			{ id: 'spent', label: 'Spent' },
			{ id: 'earned', label: 'Earned' },
		],
	},
	{
		path: 'net-worth',
		label: 'Net worth',
		about: 'What you own, what you owe, and how it has grown',
		sections: [
			{ id: 'owned', label: 'Invested' },
			{ id: 'owed', label: 'Owed' },
		],
	},
	{
		path: 'transactions',
		label: 'Transactions',
		about: 'Everything in your ledger, newest first',
		sections: [],
	},
	{ path: 'files', label: 'Files', about: 'The files your ledger is kept in', sections: [] },
] as const;
