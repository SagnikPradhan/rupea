import { describe, expect, it } from 'vitest';
import { detections, preprocess, type Image, type Output } from '#lib/server/shared/onnx/detr.ts';

const output = (dims: number[], values: number[]): Output => ({
	dims,
	data: Float32Array.from(values),
});

// Red on the left half, blue on the right.
const halves = (width: number, height: number): Image => ({
	width,
	height,
	data: Uint8Array.from({ length: width * height * 4 }, (_, i) => {
		const left = (i >> 2) % width < width / 2;
		return [left ? 255 : 0, 0, left ? 0 : 255, 255][i & 3] ?? 0;
	}),
});

const normalised = (value: number, channel: number) =>
	Math.fround((value - [0.485, 0.456, 0.406][channel]!) / [0.229, 0.224, 0.225][channel]!);

describe('preprocessing an image', () => {
	it('keeps the image size and lays channels out as planes', () => {
		const pixels = preprocess(halves(50, 25));
		expect([pixels.width, pixels.height]).toEqual([50, 25]);
		expect(pixels.data).toHaveLength(3 * 50 * 25);
	});

	it('normalises each channel by its own mean and deviation', () => {
		const pixels = preprocess(halves(2, 1));
		const plane = 2;
		const channel = (c: number) => [...pixels.data.subarray(c * plane, (c + 1) * plane)];
		expect(channel(0)).toEqual([normalised(1, 0), normalised(0, 0)]);
		expect(channel(1)).toEqual([normalised(0, 1), normalised(0, 1)]);
		expect(channel(2)).toEqual([normalised(0, 2), normalised(1, 2)]);
	});
});

describe('reading detections', () => {
	const labels = ['table', 'table rotated'];
	const region = { x1: 100, y1: 200, x2: 300, y2: 600 };

	it('labels each query with its likeliest class, in page coordinates', () => {
		const [found] = detections({
			logits: output([1, 1, 3], [0, 5, 0]),
			boxes: output([1, 1, 4], [0.5, 0.25, 0.5, 0.5]),
			labels,
			threshold: 0.5,
			region,
		});
		expect(found).toMatchObject({ label: 'table rotated', x1: 150, y1: 200, x2: 250, y2: 400 });
		expect(found?.score).toBeCloseTo(Math.exp(5) / (Math.exp(5) + 2));
	});

	it('scores a query by softmax over all classes, "no object" included', () => {
		const [found] = detections({
			logits: output([1, 1, 3], [0, 0, 0]),
			boxes: output([1, 1, 4], [0.5, 0.5, 1, 1]),
			labels,
			threshold: 0.3,
			region,
		});
		expect(found?.score).toBeCloseTo(1 / 3);
	});

	it('drops queries below the threshold', () => {
		const found = detections({
			logits: output([1, 2, 3], [4, 0, 0, 0, 0, 4]),
			boxes: output([1, 2, 4], [0.5, 0.5, 0.2, 0.2, 0.5, 0.5, 0.4, 0.4]),
			labels,
			threshold: 0.5,
			region,
		});
		expect(found.map((d) => d.label)).toEqual(['table']);
	});

	it('finds nothing in an empty output', () => {
		const found = detections({
			logits: output([1, 0, 3], []),
			boxes: output([1, 0, 4], []),
			labels,
			threshold: 0.5,
			region,
		});
		expect(found).toEqual([]);
	});
});
