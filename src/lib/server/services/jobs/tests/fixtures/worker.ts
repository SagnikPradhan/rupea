import { fault, type RupeeError } from '#lib/server/shared/result/error.ts';

type Claimed = { payload: { word: string } };

export default (c: Claimed): RupeeError | null => {
	if (c.payload.word === 'crash') process.exit(1);
	if (c.payload.word === 'hang') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
	if (c.payload.word === 'locked') return fault('ExtractionLocked', { path: 'a.pdf' });
	return null;
};
