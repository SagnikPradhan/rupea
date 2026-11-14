/** Holds any amount of a numeric(38) column, whose largest needs 127 bits. */
const WIDTH = 16;

/** A day with no amount, which no numeric(38) reaches. */
export const NO_AMOUNT = -(2n ** 127n);

export const writeSeries = (amounts: bigint[]): Buffer => {
	const bytes = Buffer.alloc(amounts.length * WIDTH);
	amounts.forEach((a, i) => {
		bytes.writeBigUInt64LE(BigInt.asUintN(64, a), i * WIDTH);
		bytes.writeBigInt64LE(a >> 64n, i * WIDTH + 8);
	});

	return bytes;
};

/** How many days a series holds. */
export const lengthOf = (b: Buffer) => b.length / WIDTH;

/** The amount on one day of a series. */
export const readDay = (bytes: Buffer, day: number): bigint => {
	const low = bytes.readBigUInt64LE(day * WIDTH);
	const high = bytes.readBigInt64LE(day * WIDTH + 8);

	return high === 0n ? low : (high << 64n) + low;
};

export const readSeries = (b: Buffer): bigint[] =>
	Array.from({ length: lengthOf(b) }, (_, d) => readDay(b, d));
