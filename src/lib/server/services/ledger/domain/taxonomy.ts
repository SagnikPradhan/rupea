import { AccountType } from './types';

/** Where real money sits; Income and Expenses only say what it was for. */
export const BALANCE_TYPES = [AccountType.Assets, AccountType.Liabilities];

export const taxonomy: Record<string, string> = {
	'Expenses:Food:Groceries': 'groceries, supermarket, vegetables, milk, kirana',
	'Expenses:Food:Restaurants': 'restaurants, cafe, coffee, food delivery',
	'Expenses:Transport:Fuel': 'petrol, diesel, fuel pump, gas station',
	'Expenses:Transport:Taxi': 'cab, taxi, ride, auto rickshaw',
	'Expenses:Transport:Public': 'metro, bus, train, railway, tickets, toll',
	'Expenses:Travel': 'flight, airline, hotel, travel booking, holiday',
	'Expenses:Housing:Rent': 'house rent, landlord, pg, maintenance charges',
	'Expenses:Housing:Utilities': 'electricity, water bill, gas cylinder, broadband, internet',
	'Expenses:Phone': 'mobile recharge, prepaid, postpaid',
	'Expenses:Shopping': 'online shopping, clothes, electronics',
	'Expenses:Entertainment': 'movies, subscription, games, streaming',
	'Expenses:Health:Medical': 'hospital, doctor, clinic, pharmacy, medicines',
	'Expenses:Health:Fitness': 'gym, fitness, yoga, sports',
	'Expenses:Education': 'school fees, tuition, course, books, university',
	'Expenses:Insurance': 'insurance premium, life insurance, health insurance',
	'Expenses:Taxes': 'income tax, gst, advance tax, tds, property tax',
	'Expenses:Fees:Bank': 'bank charges, annual fee, sms charges, penalty, gst on fee',
	'Expenses:Loan:Interest': 'loan emi, interest charged, home loan, car loan',
	'Expenses:Investments': 'mutual fund, sip, stocks, demat, nps',
	'Expenses:Gifts': 'gift, donation, charity, festival',
	'Expenses:Personal': 'salon, haircut, spa, personal care',
	'Expenses:Cash': 'atm withdrawal, cash withdrawal',
	'Income:Salary': 'salary, wages, payroll, employer',
	'Income:Interest': 'interest credited, savings interest, fixed deposit interest',
	'Income:Dividends': 'dividend, stock payout',
	'Income:Refunds': 'refund, reversal, cashback, chargeback',
	'Income:Freelance': 'freelance, client payment, invoice, consulting',
	'Income:Reimbursements': 'reimbursement, expense claim, settled, split',
	'Income:Gifts': 'gift received, birthday, family transfer',
};

export const accountType = (a: string): AccountType | null =>
	Object.values(AccountType).find((r) => r === a.split(':')[0]) ?? null;

/** An account and every account above it, the topmost first. */
export const parentsOf = (a: string) => a.split(':').map((_, i, p) => p.slice(0, i + 1).join(':'));

/** Compares part by part, so a parent sorts right before its own sub-accounts. */
export const byPath = (a: string, b: string) => {
	const x = a.split(':');
	const y = b.split(':');
	const i = x.findIndex((p, n) => p !== y[n]);

	return i === -1 ? x.length - y.length : (x[i] ?? '').localeCompare(y[i] ?? '');
};
