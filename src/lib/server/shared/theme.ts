import { getRequestEvent } from '$app/server';
import { setCookie } from './cookies.ts';

export type Theme = 'system' | 'light' | 'dark';

const NAME = 'theme';
const YEAR = 60 * 60 * 24 * 365;

const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

export const readTheme = (): Theme => {
	const value = getRequestEvent().cookies.get(NAME) ?? '';
	return isTheme(value) ? value : 'system';
};

export const cycleTheme = (): Theme => {
	const next = NEXT[readTheme()];
	setCookie(NAME, next, { maxAge: YEAR });
	return next;
};

const isTheme = (v: string): v is Theme => Object.hasOwn(NEXT, v);
