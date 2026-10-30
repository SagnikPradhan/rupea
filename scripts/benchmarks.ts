import { readFile } from 'node:fs/promises';

/** The part of vitest's JSON report that holds benchmark timings, in milliseconds. */
type Report = {
	testResults: {
		assertionResults: {
			benchmarks?: {
				name: string;
				tasks: { name: string; latency: { mean: number; sd: number } }[];
			}[];
		}[];
	}[];
};

const report: Report = JSON.parse(await readFile(process.argv[2] ?? 'benchmarks.json', 'utf8'));

const results = report.testResults
	.flatMap((f) => f.assertionResults)
	.flatMap((t) => t.benchmarks ?? [])
	.flatMap((s) =>
		s.tasks.map((k) => ({
			name: `${s.name} > ${k.name}`,
			unit: 'ms',
			value: k.latency.mean,
			range: `± ${k.latency.sd}`,
		})),
	);

console.log(JSON.stringify(results, null, '\t'));
