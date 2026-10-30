export const chunks = <T>(l: T[], n: number): T[][] =>
	Array.from({ length: Math.ceil(l.length / n) }, (_, c) => l.slice(c * n, (c + 1) * n));
