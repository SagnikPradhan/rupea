<script lang="ts" module>
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { EditorState, StateEffect, StateField } from '@codemirror/state';
	import { Decoration, EditorView, keymap, lineNumbers } from '@codemirror/view';
	import { onMount, untrack } from 'svelte';
	import { ledger } from './ledger.ts';

	const linked = Decoration.line({ class: 'cm-linked' });
	const link = StateEffect.define<number>();
	const links = StateField.define({
		create: () => Decoration.none,
		update: (marked, tr) =>
			tr.effects.reduce(
				(all, e) => (e.is(link) ? Decoration.set([linked.range(e.value)]) : all),
				marked.map(tr.changes),
			),
		provide: (f) => EditorView.decorations.from(f),
	});

	const problem = Decoration.line({ class: 'cm-problem' });
	const flag = StateEffect.define<number[]>();
	const flagged = StateField.define({
		create: () => Decoration.none,
		update: (marked, tr) =>
			tr.effects.reduce(
				(all, e) =>
					e.is(flag)
						? Decoration.set(
								e.value.map((at) => problem.range(at)),
								true,
							)
						: all,
				marked.map(tr.changes),
			),
		provide: (f) => EditorView.decorations.from(f),
	});

	const theme = EditorView.theme({
		'&': {
			border: '1px solid var(--color-border)',
			borderRadius: 'var(--radius)',
			backgroundColor: 'var(--color-surface)',
			color: 'var(--color-ink)',
		},
		'&.cm-focused': { outline: 'none', borderColor: 'var(--color-accent)' },
		'.cm-content': { minHeight: '50dvh', caretColor: 'var(--color-ink)' },
		'.cm-gutter': { minHeight: '50dvh' },
		'.cm-scroller': {
			fontFamily: 'var(--font-mono)',
			fontSize: 'var(--font-size-1)',
		},
		'.cm-gutters': {
			border: 'none',
			borderRadius: 'var(--radius) 0 0 var(--radius)',
			backgroundColor: 'var(--color-subtle)',
			color: 'var(--color-muted)',
		},
		'.cm-linked': { backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' },
		'.cm-problem': {
			backgroundColor: 'color-mix(in srgb, var(--color-negative) 10%, transparent)',
		},
		'.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
			backgroundColor: 'color-mix(in srgb, var(--color-accent) 25%, transparent)',
		},
	});

	type Props = {
		label: string;
		value: string;
		/** 1-based lines to mark as having a problem. */
		problems: number[];
		/** A 1-based line to move the cursor to and show. */
		line: number | null;
		onchange: (value: string) => void;
		onsave: () => void;
		onformat: () => void;
	};
</script>

<script lang="ts">
	const { label, value, problems, line, onchange, onsave, onformat }: Props = $props();

	const holder = $state<{ element?: HTMLDivElement; view?: EditorView }>({});
	const typed = { text: '' };

	onMount(() => {
		const parent = holder.element;
		if (!parent) return;

		typed.text = value;
		const view = new EditorView({
			parent,
			state: EditorState.create({
				doc: value,
				extensions: [
					lineNumbers(),
					history(),
					links,
					flagged,
					keymap.of([
						{ key: 'Mod-s', run: save, preventDefault: true },
						{ key: 'Shift-Alt-f', run: format, preventDefault: true },
						...defaultKeymap,
						...historyKeymap,
					]),
					EditorView.contentAttributes.of({ 'aria-label': label }),
					EditorView.updateListener.of((u) => u.docChanged && change(u.state.doc.toString())),
					ledger,
					theme,
				],
			}),
		});
		holder.view = view;
		return () => view.destroy();
	});

	$effect(() => {
		const view = holder.view;
		if (!view || value === typed.text) return;

		const at = untrack(() => line);
		typed.text = value;
		view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
		reveal(view, at);
	});

	$effect(() => {
		const view = holder.view;
		if (view) view.dispatch({ effects: flag.of(startsOf(view, problems)) });
	});

	$effect(() => {
		const view = holder.view;
		if (view) reveal(view, line);
	});

	function reveal(view: EditorView, at: number | null) {
		if (at === null || at > view.state.doc.lines) return;

		const from = view.state.doc.line(at).from;
		view.dispatch({
			selection: { anchor: from },
			effects: [link.of(from), EditorView.scrollIntoView(from, { y: 'center' })],
		});
	}

	function change(text: string) {
		typed.text = text;
		onchange(text);
	}

	function save() {
		onsave();
		return true;
	}

	function format() {
		onformat();
		return true;
	}

	function startsOf(view: EditorView, lines: number[]) {
		const doc = view.state.doc;
		return lines.filter((l) => l >= 1 && l <= doc.lines).map((l) => doc.line(l).from);
	}
</script>

<div bind:this={holder.element}></div>
