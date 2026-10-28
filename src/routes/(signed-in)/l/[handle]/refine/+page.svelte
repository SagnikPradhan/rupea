<script lang="ts">
	import { listFiles } from '#lib/endpoints/files.remote.ts';
	import {
		linkGroups,
		dismissSuggestion,
		listSuggestions,
	} from '#lib/endpoints/refinement.remote.ts';
	import type { RupeaError } from '#lib/server/shared/result/error.ts';
	import PageHeader from '#lib/web/components/page-header/page-header.svelte';
	import { detail } from '#lib/web/shared/errors.ts';
	import { fileHref, ledgerCrumb } from '#lib/web/shared/links.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	type Suggestion = NonNullable<Awaited<ReturnType<typeof listSuggestions>>['data']>[number];

	const KEYS: Record<string, string> = { primary: 'group', evidence: 'same-as' };

	const { data } = $props();

	const handle = $derived(data.ledger.handle);
	const file = $derived(page.url.searchParams.get('file'));

	const files = $derived(await listFiles(handle));
	const response = $derived(file === null ? null : await listSuggestions({ handle, file }));
	const suggestions = $derived(response?.data ?? []);
	const duplicates = $derived(suggestions.filter((s) => s.confidence === 'duplicate'));

	const failures = $state({ list: [] as RupeaError[] });
	const swapped = $state<Record<string, boolean>>({});

	// Only a new group has both links to swap; joining one keeps its primary.
	const links = (s: Suggestion) =>
		swapped[s.fingerprint] && s.links.length === 2
			? s.links.map((l, i) => ({ ...l, role: s.links[1 - i]?.role ?? l.role }))
			: s.links;

	const roleAt = (s: Suggestion, t: Suggestion['ours']) =>
		links(s).find((l) => l.file === t.file && l.line === t.line)?.role;

	const edits = (s: Suggestion[]) =>
		s.flatMap((x) => links(x).map((l) => ({ ...l, group: x.group ?? '' })));

	async function accept(s: Suggestion[]) {
		const accepted = await linkGroups({ handle, edits: edits(s) });
		failures.list = [...accepted.errors, ...(accepted.data ?? [])];
	}

	async function dismiss(s: Suggestion) {
		if (file === null) return;
		const dismissed = await dismissSuggestion({ handle, file, fingerprint: s.fingerprint });
		failures.list = dismissed.errors;
	}
</script>

{#snippet side(t: Suggestion['ours'], role: string | undefined, group: string | null)}
	<div>
		<p><a href={fileHref(handle, t.file, t.line)}>{t.file}:{t.line}</a></p>
		<pre>{[
				`${t.date} ${t.description}`,
				...(role ? [`\t- ${KEYS[role]}: ${group}   ← added`] : []),
				...t.postings.map((p) => `\t${p.account} ${p.quantity}`),
			].join('\n')}</pre>
	</div>
{/snippet}

<PageHeader trail={[ledgerCrumb(data.ledger)]}>Refine</PageHeader>

<label>
	Find matches for
	<select
		value={file ?? ''}
		onchange={(e) => goto(`?file=${encodeURIComponent(e.currentTarget.value)}`)}
	>
		<option value="" disabled>Choose a file</option>
		{#each files.data ?? [] as f (f.key)}
			<option value={f.key}>{f.key}</option>
		{/each}
	</select>
</label>

{#each [...(response?.errors ?? []), ...failures.list] as error, i (i)}
	<p role="alert">{detail(error)}</p>
{/each}

{#if file !== null && response?.data}
	{#if suggestions.length === 0}
		<p>No possible matches for {file}.</p>
	{:else}
		<p>
			{suggestions.length} possible {suggestions.length === 1 ? 'match' : 'matches'}.
			<button onclick={() => accept(duplicates)} disabled={duplicates.length === 0}>
				Accept all {duplicates.length} duplicates
			</button>
			<button onclick={() => accept(suggestions)}>Accept all</button>
		</p>

		{#each suggestions as s (s.fingerprint)}
			<article aria-label="Match {s.ours.file}:{s.ours.line}">
				<h2>{s.confidence === 'duplicate' ? 'Duplicate' : 'Possible match'}: {s.group}</h2>
				<div style="display: flex; gap: 2rem">
					{@render side(s.ours, roleAt(s, s.ours), s.group)}
					{@render side(s.theirs, roleAt(s, s.theirs), s.group)}
				</div>
				<button onclick={() => accept([s])}>Accept</button>
				{#if s.links.length === 2}
					<button onclick={() => (swapped[s.fingerprint] = !swapped[s.fingerprint])}>
						Swap primary
					</button>
				{/if}
				<button onclick={() => dismiss(s)}>Dismiss</button>
			</article>
		{/each}
	{/if}
{/if}
