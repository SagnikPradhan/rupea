export const safely = <T>(run: () => T): T | undefined => {
	// eslint-disable-next-line functional/no-try-statements -- the one wrapper
	try {
		return run();
	} catch {
		return undefined;
	}
};

export const inOrder = async (l: (() => Promise<unknown>)[]): Promise<void> => {
	for (const f of l) await f();
};
