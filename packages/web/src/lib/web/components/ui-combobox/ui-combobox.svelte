<script lang="ts">
	import { Combobox } from 'bits-ui';

	type Props = {
		value: string;
		/** What it suggests; typing narrows them, and any text is accepted. */
		options: string[];
		onchange: (value: string) => void;
		placeholder?: string | undefined;
		required?: boolean;
		onfocus?: (() => void) | undefined;
	};

	const { value, options, onchange, placeholder, required = false, onfocus }: Props = $props();

	const view = $state({ open: false, typed: false });

	const matching = $derived(
		view.typed ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase())) : options,
	);
</script>

<Combobox.Root
	type="single"
	bind:open={view.open}
	onOpenChange={(open) => open || (view.typed = false)}
	inputValue={value}
	onValueChange={onchange}
	items={options.map((o) => ({ value: o, label: o }))}
>
	<Combobox.Input
		{placeholder}
		{required}
		spellcheck="false"
		autocomplete="off"
		oninput={(e) => {
			view.typed = true;
			onchange(e.currentTarget.value);
		}}
		onfocus={() => {
			Object.assign(view, { open: true, typed: false });
			onfocus?.();
		}}
	/>
	{#if matching.length > 0}
		<Combobox.Portal>
			<Combobox.Content side="bottom" align="start" sideOffset={4} collisionPadding={8}>
				<Combobox.Viewport>
					{#each matching as option (option)}
						<Combobox.Item value={option} label={option}>{option}</Combobox.Item>
					{/each}
				</Combobox.Viewport>
			</Combobox.Content>
		</Combobox.Portal>
	{/if}
</Combobox.Root>

<style>
	:global([data-combobox-input]) {
		width: 100%;
	}

	:global([data-combobox-content]) {
		z-index: var(--layer-popover);
		min-width: var(--bits-combobox-anchor-width);
		max-height: min(var(--bits-combobox-content-available-height), calc(var(--size-2) * 15));
		padding: var(--size-0);
		color: var(--color-ink);
		background: var(--color-surface);
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--radius-2);
		overflow-y: auto;
	}

	:global([data-combobox-item]) {
		padding: var(--size-1) var(--size-2);
		border-radius: var(--radius-1);
		cursor: pointer;
	}

	:global([data-combobox-item][data-highlighted]) {
		background: var(--color-subtle);
	}
</style>
