/** Where uploads and their imports wait for review; the ledger counts nothing under it. */
const REVIEW = '_';
export const STATEMENTS = `${REVIEW}/statements`;
export const IMPORTS = `${REVIEW}/imports`;

export const isCounted = (k: string) => !k.startsWith(`${REVIEW}/`);

export const isLedgerFile = (k: string) => k.endsWith('.rupee') && !k.startsWith(`${STATEMENTS}/`);
