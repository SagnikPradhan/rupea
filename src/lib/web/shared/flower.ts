const CENTER = 16;
const PALETTE = 10;

/** One petal pointing up from the centre of a 32 by 32 square, turned by rotate degrees. */
type Petal = { d: string; rotate: number };

/** A flower drawn from a name: a chart colour, an outer ring of petals, an inner ring turned half a step, and a core. */
export type Flower = { color: number; outer: Petal[]; inner: Petal[]; core: number };

/** The same name always gives the same flower. */
export const flowerOf = (name: string): Flower => {
	const next = sequence(name);

	const color = 1 + Math.floor(next() * PALETTE);
	const count = 5 + Math.floor(next() * 8);
	const width = 3 + next() * 5;
	const reach = 11 + next() * 4;

	return {
		color,
		outer: ring(count, 0, reach, width),
		inner: ring(count, 0.5, reach * 0.55, width * 0.6),
		core: 1.5 + next() * 1.5,
	};
};

const ring = (count: number, offset: number, reach: number, width: number): Petal[] =>
	Array.from({ length: count }, (_, i) => ({
		d: petal(reach, width),
		rotate: round(((i + offset) * 360) / count),
	}));

const petal = (reach: number, width: number): string => {
	const tip = CENTER - reach;
	const left = CENTER - width;
	const right = CENTER + width;
	const near = CENTER - reach * 0.35;
	const far = CENTER - reach * 0.85;

	return `M${CENTER} ${CENTER}C${left} ${near} ${left} ${far} ${CENTER} ${tip}C${right} ${far} ${right} ${near} ${CENTER} ${CENTER}Z`;
};

const round = (n: number): number => Math.round(n * 10) / 10;

/** Numbers between 0 and 1 that depend only on the name: an FNV-1a hash of it seeds a mulberry32 stream. */
const sequence = (name: string): (() => number) => {
	const seed = { value: 2166136261 };
	for (const char of name) seed.value = Math.imul(seed.value ^ char.charCodeAt(0), 16777619);

	return () => {
		seed.value = (seed.value + 0x6d2b79f5) | 0;
		const a = Math.imul(seed.value ^ (seed.value >>> 15), 1 | seed.value);
		const b = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
		return ((b ^ (b >>> 14)) >>> 0) / 4294967296;
	};
};
