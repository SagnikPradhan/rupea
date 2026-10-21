/** Ledger files Rupee reads as they are written: its own, and ledger's and hledger's in the syntax they share. */
export const TEXT_EXTENSIONS = ['.rupee', '.ledger', '.journal', '.dat', '.txt'];

/** Statements a schema reads, then ledger files, which import on their own. */
export const UPLOAD_EXTENSIONS = ['.csv', '.xls', '.xlsx', '.pdf', ...TEXT_EXTENSIONS];
