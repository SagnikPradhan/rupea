<script lang="ts">
	import { requestCode, verifyCode } from '#lib/endpoints/auth.remote.ts';

	const sent = $derived(requestCode.result?.data?.email ?? verifyCode.fields.email.value());
</script>

<h1>Sign in</h1>

{#if !sent}
	<form {...requestCode}>
		<label>
			Email
			<input {...requestCode.fields.email.as('email')} required />
		</label>
		{#each requestCode.fields.email.issues() ?? [] as issue (issue.message)}
			<p role="alert">{issue.message}</p>
		{/each}
		<button disabled={requestCode.pending > 0}>Email me a code</button>
	</form>
{:else}
	<p>If that address can sign in, a code is on its way.</p>
	<form {...verifyCode}>
		<input {...verifyCode.fields.email.as('hidden', sent)} />
		<label>
			Code
			<input
				{...verifyCode.fields.code.as('text')}
				inputmode="numeric"
				autocomplete="one-time-code"
				required
			/>
		</label>
		{#each verifyCode.fields.code.issues() ?? [] as issue (issue.message)}
			<p role="alert">{issue.message}</p>
		{/each}
		{#if verifyCode.result && !verifyCode.result.ok}
			<p role="alert">Something went wrong. Try again.</p>
		{/if}
		<button disabled={verifyCode.pending > 0}>Sign in</button>
	</form>
{/if}
