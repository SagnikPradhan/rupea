import { randomInt } from 'node:crypto';
import { adjectives, animals } from 'unique-names-generator';

// `quiet-heron`. Some 400,000 of them, so a clash is rare and one retry settles it.
export const petName = (): string => `${pick(adjectives)}-${pick(animals)}`;

export const isHandle = (t: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t);

const pick = (w: string[]): string => w[randomInt(w.length)] ?? '';
