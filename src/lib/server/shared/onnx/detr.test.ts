import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { detections, preprocess, type Output } from './detr';

const output = (dims: number[], values: number[]): Output => ({
	dims,
	data: Float32Array.from(values),
});

// Red on the left half, blue on the right.
const halves = () => {
	const canvas = createCanvas(200, 100);
	const context = canvas.getContext('2d');
	context.fillStyle = '#ff0000';
	context.fillRect(0, 0, 100, 100);
	context.fillStyle = '#0000ff';
	context.fillRect(100, 0, 100, 100);
	return canvas;
};

const normalised = (value: number, channel: number) =>
	Math.fround((value - [0.485, 0.456, 0.406][channel]!) / [0.229, 0.224, 0.225][channel]!);

describe('preprocessing a region', () => {
	it('scales the longer side to the model size, keeping the aspect ratio', () => {
		const pixels = preprocess({
			canvas: halves(),
			region: { x1: 0, y1: 0, x2: 200, y2: 100 },
			longest: 50,
		});
		expect([pixels.width, pixels.height]).toEqual([50, 25]);
		expect(pixels.data).toHaveLength(3 * 50 * 25);
	});

	it('crops to the region and lays channels out as planes', () => {
		const pixels = preprocess({
			canvas: halves(),
			region: { x1: 120, y1: 10, x2: 180, y2: 90 },
			longest: 8,
		});
		const plane = pixels.width * pixels.height;
		const channel = (c: number) => [...pixels.data.subarray(c * plane, (c + 1) * plane)];
		expect(new Set(channel(0))).toEqual(new Set([normalised(0, 0)]));
		expect(new Set(channel(1))).toEqual(new Set([normalised(0, 1)]));
		expect(new Set(channel(2))).toEqual(new Set([normalised(1, 2)]));
	});

	it('keeps at least one pixel for a sliver of a region', () => {
		const pixels = preprocess({
			canvas: halves(),
			region: { x1: 0, y1: 0, x2: 200, y2: 0.1 },
			longest: 10,
		});
		expect([pixels.width, pixels.height]).toEqual([10, 1]);
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
