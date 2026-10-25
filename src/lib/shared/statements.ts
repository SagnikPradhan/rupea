/** Ledger files Rupea reads as they are written: its own, and ledger's and hledger's in the syntax they share. */
export const TEXT_EXTENSIONS = ['.rupea', '.ledger', '.journal', '.dat', '.txt'];

/** Statements a schema reads, then ledger files, which import on their own. */
export const UPLOAD_EXTENSIONS = ['.csv', '.xls', '.xlsx', '.pdf', ...TEXT_EXTENSIONS];
