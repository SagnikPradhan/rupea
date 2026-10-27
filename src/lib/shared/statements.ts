/** Ledger files Rupea reads as they are written: its own, and ledger's and hledger's in the syntax they share. */
export const TEXT_EXTENSIONS = ['.rupea', '.ledger', '.journal', '.dat', '.txt'];

/** Statements a schema reads, then ledger files, which import on their own. */
export const UPLOAD_EXTENSIONS = ['.csv', '.xls', '.xlsx', '.pdf', ...TEXT_EXTENSIONS];

/** A ledger file already, which imports as it is written, with no schema. */
export const isLedgerFile = (n: string) => TEXT_EXTENSIONS.some((e) => n.toLowerCase().endsWith(e));
