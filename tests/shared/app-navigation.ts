import { vi } from 'vitest';

/** Stands in for $app/navigation: `vi.mock('$app/navigation', () => import('#tests/shared/app-navigation.ts'))`. */
export const goto = vi.fn(() => Promise.resolve());

export const beforeNavigate = vi.fn();
