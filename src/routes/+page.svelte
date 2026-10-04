<script lang="ts">
	import { signOut } from '#lib/endpoints/auth.remote.ts';

	const { data } = $props();
</script>

<h1>Rupee</h1>

{#if data.user}
	<p>Signed in as {data.user.email}</p>
	<nav>
		<a href="/ledger/files">Ledger files</a>
		<a href="/ledger/transactions">Transactions</a>
		<a href="/ledger/import">Import a statement</a>
		<a href="/ledger/schemas">Statement schemas</a>
	</nav>
	<form {...signOut}>
		<button>Sign out</button>
	</form>
{:else}
	<a href="/sign-in">Sign in</a>
{/if}
