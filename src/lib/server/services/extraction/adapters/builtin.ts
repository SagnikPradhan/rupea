import { basename } from 'node:path';

// Bundled into the build, so they ship without reading files at runtime.
const files = import.meta.glob<string>('../schemas/*.yml', {
	query: '?raw',
	import: 'default',
	eager: true,
});

/** The schemas Rupee ships for common sources. */
export const builtinSchemas = () =>
	Object.entries(files).map(([path, content]) => ({ key: basename(path), content }));
