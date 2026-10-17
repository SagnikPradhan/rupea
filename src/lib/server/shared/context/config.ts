export type RupeeConfiguration = {
	dateFormats: string[];
	timeFormats: string[];
	// When closed, only the first user can sign up.
	signup: 'open' | 'closed';
	prediction: {
		history: number;
		name: number;
	};
};

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
	prediction: { history: 0.15, name: 0.35 },
};
