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

export const readSeries = (bytes: Buffer): bigint[] =>
	Array.from({ length: bytes.length / WIDTH }, (_, i) => {
		const low = bytes.readBigUInt64LE(i * WIDTH);
		const high = bytes.readBigInt64LE(i * WIDTH + 8);

		return high === 0n ? low : (high << 64n) + low;
	});
