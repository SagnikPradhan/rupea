<script lang="ts">
	import Button from '#lib/web/components/button/button.svelte';
	import CodeInput from '#lib/web/components/code-input/code-input.svelte';
	import Field from '#lib/web/components/field/field.svelte';
	import { requestCode, verifyCode } from '#lib/endpoints/auth.remote.ts';

	const resend = requestCode.for('resend');

	const sent = $derived(requestCode.result?.data?.email ?? verifyCode.fields.email.value());
</script>

<h1>Sign in</h1>

{#if !sent}
	<p>We'll email you a code to sign in with.</p>
	<form {...requestCode}>
		<Field label="Email" issues={requestCode.fields.email.issues()}>
			<input {...requestCode.fields.email.as('email')} autocomplete="email" required />
		</Field>
		<Button primary disabled={requestCode.pending > 0}>Email me a code</Button>
	</form>
{:else}
	<p>If <strong>{sent}</strong> can sign in, a code is on its way. It expires in 10 minutes.</p>
	<form {...verifyCode}>
		<input {...verifyCode.fields.email.as('hidden', sent)} />
		<Field label="Code" issues={verifyCode.fields.code.issues()}>
			<CodeInput {...verifyCode.fields.code.as('text')} maxlength={6} required />
		</Field>
		{#if verifyCode.result && !verifyCode.result.ok}
			<p role="alert">Something went wrong. Try again.</p>
		{/if}
		<div class="actions">
			<Button primary disabled={verifyCode.pending > 0}>Sign in</Button>
			<Button form="resend" disabled={resend.pending > 0}>Resend code</Button>
			{#if resend.result?.ok}
				<span role="status">Sent again.</span>
			{/if}
		</div>
		<a href="/sign-in" data-sveltekit-reload>Use a different email</a>
	</form>
	<form {...resend} id="resend">
		<input {...resend.fields.email.as('hidden', sent)} />
	</form>
{/if}

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: var(--size-3);
		align-items: start;
		margin-top: var(--size-4);
	}

	.actions {
		display: flex;
		gap: var(--size-2);
		align-items: center;
		color: var(--color-muted);
	}

	#resend {
		display: none;
	}

	p[role='alert'] {
		margin: 0;
		color: var(--color-negative);
	}
</style>
