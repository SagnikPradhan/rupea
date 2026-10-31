<script lang="ts" module>
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { search, searchKeymap } from '@codemirror/search';
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

	const phrases = EditorState.phrases.of({
		next: 'Next',
		previous: 'Previous',
		all: 'All',
		'match case': 'Match case',
		regexp: 'Regex',
		'by word': 'Whole word',
		replace: 'Replace',
		'replace all': 'Replace all',
	});

	const theme = EditorView.theme({
		'&': {
			borderTop: '1px solid var(--color-ink)',
			color: 'var(--color-ink)',
		},
		'&.cm-focused': { outline: 'none', borderTopColor: 'var(--color-accent)' },
		'.cm-content': {
			minHeight: '16rem',
			padding: 'var(--gap-label) 0',
			caretColor: 'var(--color-ink)',
		},
		'.cm-scroller': {
			fontFamily: 'var(--font-mono)',
			fontSize: 'var(--text-data)',
			lineHeight: '1.5',
		},
		'.cm-gutters': {
			border: 'none',
			backgroundColor: 'transparent',
			color: 'var(--color-muted)',
		},
		'.cm-lineNumbers .cm-gutterElement': { paddingRight: 'var(--gap-related)' },
		'.cm-linked': { backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' },
		'.cm-problem': {
			backgroundColor: 'color-mix(in srgb, var(--color-negative) 10%, transparent)',
		},
		'.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
			backgroundColor: 'color-mix(in srgb, var(--color-accent) 25%, transparent)',
		},
		'.cm-searchMatch': { backgroundColor: 'var(--color-shade-2)' },
		'.cm-searchMatch-selected': { backgroundColor: 'var(--color-shade-4)' },
		'.cm-panels': { backgroundColor: 'var(--color-surface)', color: 'var(--color-ink)' },
		'.cm-panels-top': { borderBottom: '1px solid var(--color-border)' },
		'.cm-panel.cm-search': {
			display: 'flex',
			flexWrap: 'wrap',
			alignItems: 'center',
			gap: 'var(--gap-label)',
			padding: 'var(--gap-label) var(--gap-block) var(--gap-label) 0',
			fontFamily: 'var(--font-body)',
			fontSize: 'var(--text-small)',
		},
		'.cm-panel.cm-search br': { flexBasis: '100%' },
		'.cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label': {
			margin: '0',
		},
		'.cm-panel.cm-search .cm-textfield, .cm-panel.cm-search .cm-button': {
			padding: 'var(--gap-tight) var(--gap-label)',
			border: '1px solid var(--color-muted)',
			borderRadius: 'var(--radius)',
			backgroundColor: 'var(--color-surface)',
			backgroundImage: 'none',
			fontSize: 'var(--text-small)',
		},
		'.cm-panel.cm-search .cm-textfield:focus-visible': {
			outline: 'none',
			borderColor: 'var(--color-accent)',
		},
		'.cm-panel.cm-search label': {
			display: 'flex',
			alignItems: 'center',
			gap: 'var(--gap-tight)',
			fontSize: 'var(--text-small)',
		},
		'.cm-panel.cm-search [name=close]': {
			top: 'var(--gap-label)',
			right: '0',
			padding: '0 var(--gap-label)',
			border: 'none',
			fontSize: 'var(--text-heading)',
			lineHeight: '1',
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
					search({ top: true }),
					phrases,
					keymap.of([
						{ key: 'Mod-s', run: save, preventDefault: true },
						{ key: 'Shift-Alt-f', run: format, preventDefault: true },
						...defaultKeymap,
						...historyKeymap,
						...searchKeymap,
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
