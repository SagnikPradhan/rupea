/** A ledger's pages in the bar, in the order the design draws them. */
export const PAGES = [
	{ path: 'accounts', label: 'Accounts' },
	{ path: 'spending', label: 'Spending' },
	{ path: 'liabilities', label: 'Liabilities' },
	{ path: 'transactions', label: 'Transactions' },
	{ path: 'files', label: 'Files' },
] as const;
