const NOISE = new Set(['upi', 'neft', 'imps', 'rtgs', 'pos', 'ach', 'nach', 'ecs']);

const WORDS = /[^\p{L}\p{N}]+/u;

export const clean = (description: string): string =>
	description
		.toLowerCase()
		.replace(/\d{4,}/g, ' ')
		.split(WORDS)
		.filter((w) => w !== '' && !NOISE.has(w))
		.join(' ');

export const accountText = (account: string): string =>
	account
		.toLowerCase()
		.split(WORDS)
		.filter((w) => w !== '')
		.join(' ');
