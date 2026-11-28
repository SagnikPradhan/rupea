<script lang="ts">
	import { saveUser, sendCode } from '#lib/endpoints/auth.remote.ts';
	import type { RupeaError } from '@rupea/shared/errors.ts';
	import { Email, Username } from '@rupea/shared/text.ts';
	import Button from '#lib/web/components/ui-button/ui-button.svelte';
	import Field from '#lib/web/components/ui-field/ui-field.svelte';
	import Setting from '#lib/web/components/ui-setting/ui-setting.svelte';
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

	const you = $state({
		username: untrack(() => username),
		email: untrack(() => email),
		code: '',
		sent: false,
		issues: { username: [] as { message: string }[], email: [] as { message: string }[] },
		errors: [] as RupeaError[],
		saved: false,
	});

	const mailing = $derived(!local && !you.sent && you.email !== email);

	async function save(event: SubmitEvent) {
		event.preventDefault();
		you.saved = false;
		const valid = checked();
		if (!valid) return;

		if (mailing) return mail(valid.email);

		const saved = await saveUser({ ...valid, code: you.code });
		you.errors = saved.errors;
		you.saved = saved.data !== null;
		you.sent = you.sent && !you.saved;
		if (saved.data) await refreshAll();
	}

	function checked() {
		const named = v.safeParse(Username, you.username);
		const mailed = v.safeParse(Email, you.email);
		you.issues.username = named.success ? [] : [{ message: named.issues[0].message }];
		you.issues.email = mailed.success ? [] : [{ message: mailed.issues[0].message }];

		return named.success && mailed.success
			? { username: named.output, email: mailed.output }
			: null;
	}

	async function mail(address: string) {
		const sent = await sendCode({ email: address });
		you.errors = sent.errors;
		you.sent = sent.errors.length === 0;
	}

	const restart = () => {
		you.sent = false;
		you.code = '';
	};

	const action = $derived.by(() => {
		if (you.sent) return 'Confirm email';
		return mailing ? 'Email me a code' : 'Save';
	});
</script>

<Setting
	id="you-profile"
	title="Profile"
	hint="Your name in Rupea, and the address you sign in with."
>
	<form onsubmit={save} novalidate autocomplete="off">
		<Field label="Username" hint="Letters, digits and dashes." issues={you.issues.username}>
			<input bind:value={you.username} />
		</Field>
		<Field
			label="Email"
			hint={local ? undefined : 'A new address gets a code to confirm it.'}
			issues={you.issues.email}
		>
			<input type="email" bind:value={you.email} readonly={you.sent} />
		</Field>
		{#if you.sent}
			<Field label="Code" hint="On its way to {you.email}. It expires in 10 minutes.">
				<input bind:value={you.code} inputmode="numeric" autocomplete="one-time-code" />
			</Field>
		{/if}

		<div class="actions">
			<Button primary>{action}</Button>
			{#if you.sent}<Button type="button" onclick={restart}>Use another email</Button>{/if}
		</div>
		{#each you.errors as error, i (i)}<p role="alert">{explain(error, formats)}</p>{/each}
		{#if you.saved}<p role="status">Saved.</p>{/if}
	</form>
</Setting>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
		align-items: start;
	}

	input {
		width: calc(var(--size-5) * 3);
		max-width: 100%;
	}

	.actions {
		display: flex;
		gap: var(--size-1);
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
