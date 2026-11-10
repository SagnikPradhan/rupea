import { randomInt } from 'node:crypto';
import { adjectives, animals } from 'unique-names-generator';

// `quiet-heron`. Some 400,000 of them, so a clash is rare and one retry settles it.
export const petName = (): string => `${pick(adjectives)}-${pick(animals)}`;

const pick = (w: string[]): string => w[randomInt(w.length)] ?? '';
