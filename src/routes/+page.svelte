<script lang="ts">
	import { signOut } from '#lib/endpoints/auth.remote.ts';

	const { data } = $props();
</script>

<h1>Rupee</h1>

{#if data.user}
	<p>Signed in as {data.user.username}</p>
	<nav>
		<ul>
			{#each data.ledgers as ledger (ledger.handle)}
				<li>
					<a href="/l/{ledger.handle}/transactions">{ledger.name}</a>
					{ledger.owned ? '' : '(shared with you)'}
				</li>
			{/each}
		</ul>
		<a href="/schemas">Statement schemas</a>
	</nav>
	<form {...signOut}>
		<button>Sign out</button>
	</form>
{:else}
	<a href="/sign-in">Sign in</a>
{/if}
