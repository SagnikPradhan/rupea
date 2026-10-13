<script lang="ts">
	import { PinInput } from 'bits-ui';
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
			<PinInput.Root
				class="pin"
				{...verifyCode.fields.code.as('text')}
				maxlength={6}
				inputmode="numeric"
				autocomplete="one-time-code"
				required
			>
				{#snippet children({ cells })}
					{#each cells as cell, i (i)}
						<PinInput.Cell class="cell" {cell}>{cell.char}</PinInput.Cell>
					{/each}
				{/snippet}
			</PinInput.Root>
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

<style>
	label {
		display: flex;
		flex-direction: column;
		gap: var(--size-1);
		align-items: start;
	}

	label :global(.pin) {
		display: flex;
		gap: var(--size-0);
	}

	label :global(.cell) {
		display: grid;
		place-items: center;
		width: var(--size-5);
		height: var(--size-5);
		background-color: var(--color-bg);
		border: 1px solid var(--color-border);
		font-family: var(--font-mono);
	}

	label :global(.cell[data-active]) {
		border-color: var(--color-blue);
	}
</style>
