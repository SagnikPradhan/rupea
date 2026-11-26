/**
 * A ledger's pages in the bar, in the order the design draws them, with what
 * each holds.
 */
export const PAGES = [
	{
		path: 'spending',
		icon: 'spending',
		label: 'Spending',
		about: 'What came in, and where it went',
		sections: [
			{ id: 'spent', label: 'Spent' },
			{ id: 'earned', label: 'Earned' },
		],
	},
	{
		path: 'net-worth',
		icon: 'worth',
		label: 'Net worth',
		about: 'What you own, what you owe, and how it has grown',
		sections: [
			{ id: 'owned', label: 'Invested' },
			{ id: 'owed', label: 'Owed' },
		],
	},
	{
		path: 'transactions',
		icon: 'transactions',
		label: 'Transactions',
		about: 'Everything in your ledger, newest first',
		sections: [],
	},
	{
		path: 'files',
		icon: 'files',
		label: 'Files',
		about: 'The files your ledger is kept in',
		sections: [],
	},
] as const;
