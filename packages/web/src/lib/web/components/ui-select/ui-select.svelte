<script lang="ts">
	import IconCheck from '@tabler/icons-svelte-runes/icons/check';
	import IconChevron from '@tabler/icons-svelte-runes/icons/chevron-down';
	import { Select } from 'bits-ui';

	type Props = {
		value: string;
		options: { value: string; label: string }[];
		onchange: (value: string) => void;
		placeholder?: string | undefined;
		label?: string | undefined;
	};

	const { value, options, onchange, placeholder = '', label }: Props = $props();

	const chosen = $derived(options.find((o) => o.value === value));
</script>

<Select.Root type="single" {value} onValueChange={onchange} items={options}>
	<Select.Trigger aria-label={label}>
		<span class={{ placeholder: !chosen }}>{chosen?.label ?? placeholder}</span>
		<IconChevron size={16} />
	</Select.Trigger>
	<Select.Portal>
		<Select.Content side="bottom" align="start" sideOffset={4} collisionPadding={8}>
			<Select.Viewport>
				{#each options as option (option.value)}
					<Select.Item value={option.value} label={option.label}>
						{#snippet children({ selected })}
							<span>{option.label}</span>
							{#if selected}<IconCheck size={16} />{/if}
						{/snippet}
					</Select.Item>
				{/each}
			</Select.Viewport>
		</Select.Content>
	</Select.Portal>
</Select.Root>

<style>
	:global([data-select-trigger]) {
		display: inline-flex;
		min-width: calc(var(--size-2) * 10);
		max-width: 100%;
		align-items: center;
		justify-content: space-between;
		gap: var(--size-2);
		text-align: start;
	}

	:global([data-select-trigger]) span {
		min-width: 0;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}

	:global([data-select-trigger]) .placeholder {
		color: var(--color-muted);
	}

	:global([data-select-trigger][data-state='open']) {
		border-color: var(--color-ink);
	}

	:global([data-select-content]) {
		z-index: var(--layer-popover);
		min-width: var(--bits-select-anchor-width);
		max-height: min(var(--bits-select-content-available-height), calc(var(--size-2) * 15));
		padding: var(--size-0);
		color: var(--color-ink);
		background: var(--color-surface);
		border: var(--size-line-0) solid var(--color-border);
		border-radius: var(--radius-2);
		overflow-y: auto;
	}

	:global([data-select-item]) {
		display: flex;
		padding: var(--size-1) var(--size-2);
		align-items: center;
		justify-content: space-between;
		gap: var(--size-2);
		border-radius: var(--radius-1);
		cursor: pointer;
	}

	:global([data-select-item][data-highlighted]) {
		background: var(--color-subtle);
	}
</style>
