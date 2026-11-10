import { readFileSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const dist = join(root, 'dist');
const declared = Object.keys(
	JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies,
);

const IMPORT = /(?:^import[^"';]*?from\s*["']([^"']+)["'])|(?:\bimport\(["']([^"']+)["']\))/gm;

const packageOf = (s: string) =>
	s
		.split('/')
		.slice(0, s.startsWith('@') ? 2 : 1)
		.join('/');

const files = [dist, join(dist, 'assets')].flatMap((d) =>
	readdirSync(d)
		.filter((f) => f.endsWith('.js'))
		.map((f) => join(d, f)),
);
const specifiers = files.flatMap((f) =>
	[...readFileSync(f, 'utf8').matchAll(IMPORT)].map((m) => m[1] ?? m[2]!),
);
const missing = [...new Set(specifiers)]
	.filter((s) => !/^(node:|[./#])/.test(s) && !builtinModules.includes(s))
	.map(packageOf)
	.filter((p) => !declared.includes(p));

if (missing.length > 0) {
	console.error(
		`The built server imports packages missing from dependencies: ${missing.join(', ')}`,
	);
	process.exit(1);
}
