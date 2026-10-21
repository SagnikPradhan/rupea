import type { RupeeError } from '#lib/server/shared/result/error.ts';
import type { Reply } from '#lib/server/shared/result/reply.ts';

export type EditorFile = { key: string; content: string; version: string };

export type EditorApi = {
	read: (key: string) => Promise<Reply<EditorFile>>;
	check: (input: { key: string; content: string }) => Promise<Reply<unknown[]>>;
	format: (content: string) => Promise<Reply<string>>;
	save: (input: EditorFile) => Promise<Reply<EditorFile>>;
	create: (input: { key: string; content: string }) => Promise<Reply<EditorFile>>;
	rename: (input: { key: string; to: string }) => Promise<Reply<EditorFile>>;
	remove: (key: string) => Promise<Reply<string>>;
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
	open: (key: string | null) => Promise<void>;
	edit: (content: string) => void;
	format: () => Promise<boolean>;
	save: () => Promise<boolean>;
	reload: () => Promise<boolean>;
	overwrite: () => Promise<boolean>;
	create: (key: string) => Promise<boolean>;
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

	const accept = <T>(response: Reply<T>, use: (data: T) => void): boolean => {
		if (response.data === null) {
			state.errors.operation = response.errors;
			return false;
		}

		state.errors.operation = [];
		use(response.data);
		return true;
	};

	const onFile = (run: (file: EditorFile) => Promise<boolean>) => {
		const file = state.file;
		return file === null ? Promise.resolve(false) : run(file);
	};

	const check = async (wait: number) => {
		const ticket = ++latest.ticket;
		const file = state.file;
		if (file === null) return;

		if (wait > 0) await sleep(wait);
		if (ticket !== latest.ticket) return;

		const checked = await api.check({ key: file.key, content: state.content });
		if (ticket === latest.ticket) state.errors.parse = checked.errors;
	};

	const saveOver = async (file: EditorFile) => {
		state.saving = true;
		const saved = await api.save({ ...file, content: state.content });
		state.saving = false;

		state.conflict = isConflict(saved.errors);
		return accept(saved, (f) => (state.file = f));
	};

	const edit = (content: string) => {
		state.content = content;
		void check(delay);
	};

	const open = async (key: string | null) => {
		if (key === null) return close();
		const read = await api.read(key);
		close();
		if (accept(read, show)) await check(0);
	};

	return {
		state,
		get dirty() {
			return dirty;
		},

		open,
		edit,

		format: async () => {
			const formatted = await api.format(state.content);
			return accept(formatted, edit);
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
