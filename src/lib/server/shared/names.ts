import { randomInt } from 'node:crypto';
import { adjectives, animals } from 'unique-names-generator';

export const ADJECTIVES: readonly string[] = adjectives;
export const ANIMALS: readonly string[] = animals;

// Chooses one of the words it is given.
export type Pick = (words: readonly string[]) => string;

export const randomPick: Pick = (w) => w[randomInt(w.length)] ?? '';

// `quiet-heron`. Some 400,000 of them, so a clash is rare and one retry settles it.
export const petName = (p: Pick): string => `${p(ADJECTIVES)}-${p(ANIMALS)}`;

export const isHandle = (t: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t);
