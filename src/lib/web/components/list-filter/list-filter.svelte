<script lang="ts">
	import { RANGE_LABELS } from '#lib/shared/dates.ts';
	import type { Filter } from '#lib/shared/filter.ts';
	import { formatDate } from '#lib/web/format.ts';
	import { page } from '$app/state';

	/** How long typing must pause before a description is searched for. */
	const PAUSE = 300;

	type Props = { filter: Filter; accounts: string[] };

	const { filter, accounts }: Props = $props();

	const choices = $derived(['', ...pathTo(filter.account), ...childrenOf(filter.account)]);
	const kept = $derived(
		Object.entries({
			range: filter.range,
			from: filter.from,
			to: filter.to,
			account: filter.account,
		}),
	);
	const days = $derived(Boolean(filter.from || filter.to));

	const typing = { timer: 0 };

	/** The current page with some of its filter changed; an empty value drops that part. */
	function hrefWith(changes: Record<string, string>) {
		const merged = { ...Object.fromEntries(page.url.searchParams), ...changes };
		return `?${new URLSearchParams(Object.entries(merged).filter(([, value]) => value))}`;
	}

	function search(event: Event & { currentTarget: HTMLInputElement }) {
		const form = event.currentTarget.form;
		window.clearTimeout(typing.timer);
		typing.timer = window.setTimeout(() => form?.requestSubmit(), PAUSE);
	}

	/** An account and the accounts above it, the topmost first. */
	function pathTo(a: string) {
		const parts = a ? a.split(':') : [];
		return parts.map((_, i) => parts.slice(0, i + 1).join(':'));
	}

	/** Chosen days, like 1 Mar 2026 – 31 Mar 2026, or a single day once. */
	function spanOf(from: string, to: string) {
		if (from === to) return formatDate(from);
		if (!to) return `From ${formatDate(from)}`;
		if (!from) return `Until ${formatDate(to)}`;

		return `${formatDate(from)} – ${formatDate(to)}`;
	}

	function nameOf(a: string) {
		return a.split(':').at(-1) ?? a;
	}

	/** The first letter of each parent, like E:F: for Expenses:Food:Groceries. */
	function prefixOf(a: string) {
		return a
			.split(':')
			.slice(0, -1)
			.map((part) => `${part[0]}:`)
			.join('');
	}

	function same(a: string, b: string) {
		return a.toLowerCase() === b.toLowerCase();
	}

	/** The accounts one level under another, or the top level under none. */
	function childrenOf(a: string) {
		const depth = a ? a.split(':').length + 1 : 1;
		const under = accounts.filter((n) => !a || n.toLowerCase().startsWith(`${a.toLowerCase()}:`));
		const named = under.map((n) => n.split(':').slice(0, depth).join(':'));
		return [...new Map(named.map((n) => [n.toLowerCase(), n])).values()];
	}
</script>

<div class="filters" data-sveltekit-reset="false">
	<form method="GET" data-sveltekit-replacestate>
		{#each kept as [name, value] (name)}
			{#if value}<input type="hidden" {name} {value} />{/if}
		{/each}
		<input
			type="search"
			name="description"
			value={filter.description}
			placeholder="Search"
			aria-label="Search"
			oninput={search}
		/>
	</form>

	<span id="date">Date</span>
	<nav aria-labelledby="date">
		{#each Object.entries(RANGE_LABELS) as [range, name] (range)}
			<a
				href={hrefWith({ range, from: '', to: '' })}
				aria-current={!days && range === filter.range ? 'page' : undefined}>{name}</a
			>
		{/each}
		{#if days}
			<a href={hrefWith({})} aria-current="page">{spanOf(filter.from, filter.to)}</a>
		{/if}
	</nav>

	<span id="account">Account</span>
	<nav aria-labelledby="account">
		{#each choices as account (account)}
			<a
				href={hrefWith({ account })}
				aria-label={account || undefined}
				aria-current={same(account, filter.account) ? 'page' : undefined}
			>
				{#if account}<span class="prefix">{prefixOf(account)}</span>{nameOf(account)}{:else}All{/if}
			</a>
		{/each}
	</nav>
</div>

<style>
	.filters {
		display: grid;
		flex: 1;
		grid-template-columns: var(--size-6) 1fr;
		gap: var(--size-2) var(--size-3);
		align-items: center;
	}

	form {
		grid-column: 1 / -1;
	}

	span {
		color: var(--color-muted);
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-1) var(--size-3);
		align-items: center;
	}

	a {
		color: var(--color-ink);
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	.prefix {
		opacity: 0.6;
	}

	[aria-current] {
		color: var(--color-accent);
	}

	input[type='search'] {
		width: 100%;
	}
</style>
