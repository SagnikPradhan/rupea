import type { LedgerReading } from '#lib/server/shared/context/config.ts';
import { defaultConfiguration } from '#lib/server/shared/context/config.ts';

/** How tests read a ledger's files: the default formats, bare amounts in rupees. */
export const READING: LedgerReading = { ...defaultConfiguration.ledger, base: 'INR' };
