<script lang="ts">
	import { listGroups, makePrimary, renameGroup } from '#lib/endpoints/refinement.remote.ts';
	import type { RupeaError } from '#lib/server/shared/result/error.ts';
	import type { Reply } from '#lib/server/shared/result/reply.ts';
	import { detail } from '#lib/web/shared/errors.ts';

	type Props = {
		handle: string;
		file: string;
		locked: boolean;
		onchanged: () => void;
	};

	const { handle, file, locked, onchanged }: Props = $props();

	const response = $derived(await listGroups({ handle, file }));
	const failures = $state({ list: [] as RupeaError[] });

	async function run(change: Promise<Reply<RupeaError[]>>) {
		const changed = await change;
		failures.list = [...changed.errors, ...(changed.data ?? [])];
		onchanged();
	}

	async function rename(group: string) {
		const to = prompt('Rename group to', group);
		if (to === null || to === group) return;
		await run(renameGroup({ handle, file, group, to }));
	}
</script>

{#each [...response.errors, ...failures.list] as error, i (i)}
	<p role="alert">{detail(error)}</p>
{/each}

{#if (response.data ?? []).length > 0}
	<section aria-label="Groups">
		<h3>Groups</h3>
		{#if locked}<p>Save to change groups.</p>{/if}
		{#each response.data ?? [] as e (e.group)}
			<article aria-label="Group {e.group}">
				<h4>
					{e.group}
					<button onclick={() => rename(e.group)} disabled={locked}>Rename group</button>
				</h4>
				<ul>
					{#each e.members as m (`${m.file}:${m.line}`)}
						<li style:opacity={m.counted ? 1 : 0.5}>
							{m.role === 'primary' ? 'Primary' : 'Evidence'}{m.counted ? '' : ', not counted'}:
							<a href="?file={encodeURIComponent(m.file)}">{m.file}:{m.line}</a>
							{m.date}
							{m.description}
							{#if m.role !== 'primary'}
								<button
									onclick={() =>
										run(
											makePrimary({
												handle,
												file,
												group: e.group,
												member: { file: m.file, line: m.line },
											}),
										)}
									disabled={locked}
								>
									Make primary
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			</article>
		{/each}
	</section>
{/if}

<style>
	h3,
	h4 {
		margin: var(--size-2) 0 var(--size-0);
		font: 500 var(--font-size-1) / 1.125 var(--font-heading);
	}

	p,
	ul {
		margin: var(--size-2) 0 var(--size-1);
	}

	li {
		margin: var(--size-0) 0;
	}
</style>
