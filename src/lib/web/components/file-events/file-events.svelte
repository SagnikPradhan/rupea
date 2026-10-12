<script lang="ts">
	import { getEvents, makePrimary, renameEvent } from '#lib/endpoints/refinement.remote.ts';
	import type { RupeeError } from '#lib/server/shared/result/error.ts';
	import type { Reply } from '#lib/server/shared/result/reply.ts';

	type Props = {
		handle: string;
		file: string;
		/** Unsaved edits in the open file; changing an event rewrites files. */
		locked: boolean;
		onchanged: () => void;
	};

	const { handle, file, locked, onchanged }: Props = $props();

	const response = $derived(await getEvents({ handle, file }));
	const failures = $state({ list: [] as RupeeError[] });

	const describe = (error: RupeeError) =>
		[error.type, 'location' in error ? `at ${error.location}` : ''].join(' ');

	async function run(change: Promise<Reply<RupeeError[]>>) {
		const changed = await change;
		failures.list = [...changed.errors, ...(changed.data ?? [])];
		onchanged();
	}

	async function rename(event: string) {
		const to = prompt('Rename event to', event);
		if (to === null || to === event) return;
		await run(renameEvent({ handle, file, event, to }));
	}
</script>

{#each [...response.errors, ...failures.list] as error, i (i)}
	<p role="alert">{describe(error)}</p>
{/each}

{#if (response.data ?? []).length > 0}
	<section aria-label="Events">
		<h3>Events</h3>
		{#if locked}<p>Save to change events.</p>{/if}
		{#each response.data ?? [] as e (e.event)}
			<article aria-label="Event {e.event}">
				<h4>
					{e.event}
					<button onclick={() => rename(e.event)} disabled={locked}>Rename event</button>
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
												event: e.event,
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
