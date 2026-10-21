import { STATEMENTS } from '#lib/shared/folders.ts';

export const isLedgerFile = (k: string) => k.endsWith('.rupee') && !k.startsWith(`${STATEMENTS}/`);
