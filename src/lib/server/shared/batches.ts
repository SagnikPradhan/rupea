export const batches = <T>(l: T[], n: number): T[][] =>
	Array.from({ length: Math.ceil(l.length / n) }, (_, b) => l.slice(b * n, (b + 1) * n));
