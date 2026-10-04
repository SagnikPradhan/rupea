/**
 * The state of the ledger file editor: the open file, the text being edited,
 * what `check` says about it, and the outcome of saving. The remote functions
 * come in as `EditorApi`, so this runs the same against the server and a test.
 */
import type { RupeeError } from '#lib/server/shared/error.ts';
import type { Response } from '#lib/server/shared/result.ts';

/** A file as the editor needs it. */
export type EditorFile = { key: string; content: string; version: string };

export type EditorApi = {
	read: (key: string) => Promise<Response<EditorFile>>;
	check: (input: { key: string; content: string }) => Promise<Response<unknown[]>>;
	save: (input: EditorFile) => Promise<Response<EditorFile>>;
	create: (input: { key: string; content: string }) => Promise<Response<EditorFile>>;
	rename: (input: { key: string; to: string }) => Promise<Response<EditorFile>>;
	remove: (key: string) => Promise<Response<void>>;
};

const sleep = (t: number) => new Promise<void>((r) => setTimeout(r, t));

const isConflict = (e: RupeeError[]) => e.some((x) => x.type === 'StorageConflict');

type EditorState = {
	file: EditorFile | null;
	content: string;
	errors: { parse: RupeeError[]; operation: RupeeError[] };
	conflict: boolean;
	saving: boolean;
};

// Fresh each time: the state takes the object over and mutates it.
const closed = (): EditorState => ({
	file: null,
	content: '',
	errors: { parse: [], operation: [] },
	conflict: false,
	saving: false,
});

export type Editor = {
	state: EditorState;
	readonly dirty: boolean;
	/** Open `key`, or close the editor for `null`. */
	open: (key: string | null) => Promise<void>;
	/** Set the text; it is checked once typing pauses. */
	edit: (content: string) => void;
	/** Save the edit. A conflict is shown, not thrown away. True if it went through. */
	save: () => Promise<boolean>;
	reload: () => Promise<boolean>;
	/** Save over whatever is on disk now, keeping the edit. */
	overwrite: () => Promise<boolean>;
	/** Create `key`, empty, and open it. */
	create: (key: string) => Promise<boolean>;
	/** Rename the open file; the edit stays. */
	rename: (to: string) => Promise<boolean>;
	remove: () => Promise<boolean>;
};

export const createEditor = (api: EditorApi, delay: number): Editor => {
	const latest = { ticket: 0 };
	const state = $state<EditorState>(closed());
	const dirty = $derived(state.file !== null && state.content !== state.file.content);

	const close = () => {
		latest.ticket += 1;
		Object.assign(state, closed());
	};

	const show = (file: EditorFile) => {
		latest.ticket += 1;
		Object.assign(state, closed(), { file, content: file.content });
	};

	/** Use what `response` carries, or else show why it carries nothing. */
	const accept = <T>(response: Response<T>, use: (data: T) => void): boolean => {
		if (response.data === null) {
			state.errors.operation = response.errors;
			return false;
		}
		state.errors.operation = [];
		use(response.data);
		return true;
	};

	/** Run `run` on the open file; nothing happens, and nothing went through, without one. */
	const onFile = (run: (file: EditorFile) => Promise<boolean>) => {
		const file = state.file;
		return file === null ? Promise.resolve(false) : run(file);
	};

	/** Check the text after `wait`, unless an edit or open comes first. */
	const check = async (wait: number) => {
		const ticket = ++latest.ticket;
		const file = state.file;
		if (file === null) return;
		if (wait > 0) await sleep(wait);
		if (ticket !== latest.ticket) return;
		const checked = await api.check({ key: file.key, content: state.content });
		if (ticket === latest.ticket) state.errors.parse = checked.errors;
	};

	/** Save the edit over `file`; a conflict is shown, not thrown away. */
	const saveOver = async (file: EditorFile) => {
		state.saving = true;
		const saved = await api.save({ ...file, content: state.content });
		state.saving = false;
		state.conflict = isConflict(saved.errors);
		return accept(saved, (f) => (state.file = f));
	};

	const open = async (key: string | null) => {
		if (key === null) return close();
		const read = await api.read(key);
		close();
		if (accept(read, show)) await check(0);
	};

	// Everything above is internal; everything the page calls is below.
	return {
		state,
		get dirty() {
			return dirty;
		},

		open,

		edit: (content: string) => {
			state.content = content;
			void check(delay);
		},

		save: () => onFile(saveOver),

		reload: () =>
			onFile(async (file) => {
				await open(file.key);
				return state.file !== null;
			}),

		overwrite: () =>
			onFile(async (file) => {
				const read = await api.read(file.key);
				return read.data === null ? accept(read, () => {}) : saveOver(read.data);
			}),

		create: async (key: string) => {
			const created = await api.create({ key, content: '' });
			return accept(created, show);
		},

		rename: (to: string) =>
			onFile(async (file) => {
				const renamed = await api.rename({ key: file.key, to });
				return accept(renamed, (f) => (state.file = f));
			}),

		remove: () =>
			onFile(async (file) => {
				const removed = await api.remove(file.key);
				return accept(removed, close);
			}),
	};
};
