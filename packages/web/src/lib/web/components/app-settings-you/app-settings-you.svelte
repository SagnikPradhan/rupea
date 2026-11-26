<script lang="ts">
	import { saveUser, sendCode } from '#lib/endpoints/auth.remote.ts';
	import type { RupeaError } from '@rupea/shared/errors.ts';
	import { Email, Username } from '@rupea/shared/text.ts';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import Field from '#lib/web/components/ui-field/ui-field.svelte';
	import { explain } from '#lib/web/shared/errors.ts';
	import { formatsHere } from '#lib/web/shared/format.ts';
	import { refreshAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import * as v from 'valibot';

	const formats = formatsHere();

	type Props = {
		username: string;
		email: string;
		/** Whether sign-in is off, so a new address needs no code. */
		local: boolean;
	};

	const { username, email, local }: Props = $props();

	const named = $state({
		value: untrack(() => username),
		issues: [] as { message: string }[],
		errors: [] as RupeaError[],
		saved: false,
	});
	const mailed = $state({
		value: untrack(() => email),
		code: '',
		sent: false,
		issues: [] as { message: string }[],
		errors: [] as RupeaError[],
		saved: false,
	});

	async function saveName(event: SubmitEvent) {
		event.preventDefault();
		named.saved = false;
		const checked = v.safeParse(Username, named.value);
		named.issues = checked.success ? [] : [{ message: checked.issues[0].message }];
		if (!checked.success) return;

		const saved = await saveUser({ username: checked.output });
		named.errors = saved.errors;
		named.saved = saved.data !== null;
		if (saved.data) await refreshAll();
	}

	async function submitEmail(event: SubmitEvent) {
		event.preventDefault();
		mailed.saved = false;
		const checked = v.safeParse(Email, mailed.value);
		mailed.issues = checked.success ? [] : [{ message: checked.issues[0].message }];
		if (!checked.success) return;

		if (local || mailed.sent) return saveAddress(checked.output);

		const sent = await sendCode({ email: checked.output });
		mailed.errors = sent.errors;
		mailed.sent = sent.errors.length === 0;
	}

	async function saveAddress(address: string) {
		const saved = await saveUser({ email: address, code: mailed.code });
		mailed.errors = saved.errors;
		mailed.saved = saved.data !== null;
		mailed.sent = mailed.sent && !mailed.saved;
		if (saved.data) await refreshAll();
	}

	const restart = () => {
		mailed.sent = false;
		mailed.code = '';
	};

	const action = $derived.by(() => {
		if (local) return 'Save email';
		return mailed.sent ? 'Confirm email' : 'Email me a code';
	});
</script>

<div class="forms">
	<form onsubmit={saveName} novalidate autocomplete="off">
		<Field label="Username" hint="Letters, digits and dashes." issues={named.issues}>
			<input bind:value={named.value} />
		</Field>
		<Button primary>Save username</Button>
		{#each named.errors as error, i (i)}<p role="alert">{explain(error, formats)}</p>{/each}
		{#if named.saved}<p role="status">Saved.</p>{/if}
	</form>

	<form onsubmit={submitEmail} novalidate autocomplete="off">
		<Field label="Email" issues={mailed.issues}>
			<input type="email" bind:value={mailed.value} readonly={mailed.sent} />
		</Field>
		{#if mailed.sent}
			<p>A code is on its way to {mailed.value}. It expires in 10 minutes.</p>
			<Field label="Code">
				<input bind:value={mailed.code} inputmode="numeric" autocomplete="one-time-code" />
			</Field>
		{/if}
		<div class="actions">
			<Button primary>{action}</Button>
			{#if mailed.sent}<Button type="button" onclick={restart}>Use another email</Button>{/if}
		</div>
		{#each mailed.errors as error, i (i)}<p role="alert">{explain(error, formats)}</p>{/each}
		{#if mailed.saved}<p role="status">Saved.</p>{/if}
	</form>
</div>

<style>
	.forms {
		display: flex;
		flex-wrap: wrap;
		gap: var(--size-4);
	}

	form {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--size-3);
		align-items: start;
		min-width: calc(var(--size-5) * 3);
	}

	.actions {
		display: flex;
		gap: var(--size-2);
	}

	p {
		margin: 0;
	}

	p[role='alert'] {
		color: var(--color-negative);
	}

	p[role='status'] {
		color: var(--color-muted);
	}
</style>
