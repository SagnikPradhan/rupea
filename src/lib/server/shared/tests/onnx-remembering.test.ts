import { describe, expect, it } from 'vitest';
import { errAsync, okAsync } from '#lib/server/shared/result.ts';
import { remembering, type Embed } from '#lib/server/shared/onnx/remembering.ts';

const counting = () => {
	const asked: string[][] = [];
	const embed: Embed = (texts) => {
		asked.push(texts);
		return okAsync(texts.map((t) => Float32Array.of(t.length)));
	};
	return { asked, embed };
};

describe('an embed that remembers', () => {
	it('embeds a text once, however many times it is asked', async () => {
		const { asked, embed } = counting();
		const remembered = remembering(embed, 10);

		await remembered(['ab', 'ab', 'c']);
		const again = await remembered(['c', 'ab']);

		expect(asked).toEqual([['ab', 'c']]);
		expect(again._unsafeUnwrap()).toEqual([Float32Array.of(1), Float32Array.of(2)]);
	});

	it('forgets the text asked for longest ago', async () => {
		const { asked, embed } = counting();
		const remembered = remembering(embed, 2);

		await remembered(['a']);
		await remembered(['b']);
		await remembered(['a']);
		await remembered(['c']);
		await remembered(['a', 'b']);

		expect(asked).toEqual([['a'], ['b'], ['c'], ['b']]);
	});

	it('fails when the model does, and remembers nothing', async () => {
		const failing: Embed = () => errAsync({ type: 'UnknownError', message: 'no model', cause: [] });
		const remembered = remembering(failing, 10);

		expect((await remembered(['a'])).isErr()).toBe(true);
	});
});
