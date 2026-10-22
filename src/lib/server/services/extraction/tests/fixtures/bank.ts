import * as Statements from '#services/extraction/application/statements.ts';
import type { Ledger } from '#services/ledger/application/ledger.ts';

export const schema = `version: v1
name: Bank
match:
  - regex: ^Account statement$
account: Assets:Bank
header:
  text: Narration
fields:
  date: { from: [header: Date], pipe: [date: dd/MM/yy] }
  description: { from: [header: Narration] }
  amount:
    - from: [header: Debit]
      pipe: [number, negate]
    - from: [header: Credit]
      pipe: [number]
  category: { from: [header: Tag] }
`;

export const statement = [
	'Account statement',
	'Date,Narration,Debit,Credit,Tag',
	'29/08/26,UPI GROCER,"1,250.50",,Expenses:Food',
	'30/08/26,SALARY,,"50,000",',
	'31/08/26,ODD,x,,',
].join('\n');

export const bank = { key: 'bank.yml', content: schema };

export const encode = (t: string) => new TextEncoder().encode(t);

/** Stores an upload and reads it, as opening it from the inbox does. */
export const upload = async (l: Ledger, t: string | Uint8Array = statement, name = 'aug.csv') => {
	const content = typeof t === 'string' ? encode(t) : t;
	const stored = await Statements.storeStatement({ ledger: l, upload: { name, content } });
	return (
		await Statements.readStatement({ ledger: l, key: stored._unsafeUnwrap().key })
	)._unsafeUnwrap();
};

/** Where a ledger's folders are, in a storage holding every user's. */
export const folder = (l: Ledger) => `users/${l.owner}/ledgers/${l.handle}`;

/** The folder an upload made today goes in. */
export const day = () => Temporal.Now.plainDateISO().toString().replaceAll('-', '');
