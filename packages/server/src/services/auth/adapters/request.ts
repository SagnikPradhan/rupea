import { AsyncLocalStorage } from 'node:async_hooks';
import type { User } from './database';

const apiUser = new AsyncLocalStorage<User>();

export const runAs = <T>(u: User, f: () => T) => apiUser.run(u, f);

export const requestUser = () => apiUser.getStore();
