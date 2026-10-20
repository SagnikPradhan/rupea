import { AccountType } from './types';

/** Where real money sits; Income and Expenses only say what it was for. */
export const BALANCE_TYPES = [AccountType.Assets, AccountType.Liabilities];

export const taxonomy: Record<string, string> = {
	'Expenses:Food:Groceries': 'groceries, supermarket, vegetables, milk, kirana',
	'Expenses:Food:Restaurants': 'restaurants, cafe, coffee, food delivery, swiggy, zomato',
	'Expenses:Transport:Fuel': 'petrol, diesel, fuel pump, gas station',
	'Expenses:Transport:Taxi': 'cab, taxi, ride, uber, ola, rapido, auto rickshaw',
	'Expenses:Transport:Public': 'metro, bus, train, railway, irctc, fastag, toll',
	'Expenses:Travel': 'flight, airline, hotel, booking, makemytrip, holiday',
	'Expenses:Housing:Rent': 'house rent, landlord, pg, maintenance charges',
	'Expenses:Housing:Utilities': 'electricity, water bill, gas cylinder, broadband, internet',
	'Expenses:Phone': 'mobile recharge, prepaid, postpaid, airtel, jio, vodafone',
	'Expenses:Shopping': 'online shopping, amazon, flipkart, clothes, electronics, myntra',
	'Expenses:Entertainment': 'movies, netflix, spotify, subscription, games, streaming',
	'Expenses:Health:Medical': 'hospital, doctor, clinic, pharmacy, medicines',
	'Expenses:Health:Fitness': 'gym, fitness, yoga, sports',
	'Expenses:Education': 'school fees, tuition, course, books, university',
	'Expenses:Insurance': 'insurance premium, life insurance, health insurance, lic',
	'Expenses:Taxes': 'income tax, gst, advance tax, tds, property tax',
	'Expenses:Fees:Bank': 'bank charges, annual fee, sms charges, penalty, gst on fee',
	'Expenses:Loan:Interest': 'loan emi, interest charged, home loan, car loan',
	'Expenses:Investments': 'mutual fund, sip, stocks, zerodha, demat, nps',
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
