export type RupeeConfiguration = {
	/**
	 * date-fns formats a `.rupee` transaction header's date may take, like
	 * `yyyy-MM-dd`; the first that fits wins.
	 */
	dateFormats: string[];
	/** date-fns formats of the optional time after the date, like `HH:mm`. */
	timeFormats: string[];
	/**
	 * Whether anyone may create an account. When `closed`, only the first
	 * user can.
	 */
	signup: 'open' | 'closed';
};

/** Built-in preset, for tests and tools that don't read the environment. */
export const defaultConfiguration: RupeeConfiguration = {
	// Day before month: `MM/dd/yyyy` would read `03/04/2026` the other way.
	dateFormats: [
		'yyyy-MM-dd',
		'yyyy/MM/dd',
		'dd-MM-yyyy',
		'd-M-yyyy',
		'dd/MM/yyyy',
		'd/M/yyyy',
		'd MMM yyyy',
		'd MMMM yyyy',
		'MMM d, yyyy',
		'MMMM d, yyyy',
	],
	timeFormats: ['HH:mm', 'H:mm', 'HH:mm:ss', 'H:mm:ss', 'h:mm a', 'h:mm:ss a'],
	signup: 'closed',
};
