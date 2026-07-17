<!--
  PinButton — a small pin-to-top toggle. Filled + always visible when pinned;
  outline when not. By default the unpinned state reveals on hover (within a
  `group`, e.g. a card); pass `always` to keep it visible (e.g. a header row).
  Stops click propagation so it can sit on top of a clickable card.
-->
<script setup lang="ts">
withDefaults(defineProps<{ pinned?: boolean; size?: 'xs' | 'sm'; always?: boolean }>(), { size: 'sm' });
defineEmits<{ (e: 'toggle'): void }>();
</script>

<template>
	<button
		type="button"
		class="inline-flex items-center justify-center rounded-full shrink-0 transition-all"
		:class="[
			size === 'xs' ? 'w-6 h-6' : 'w-7 h-7',
			pinned
				? 'text-primary'
				: always
					? 'text-muted-foreground/50 hover:text-foreground'
					: 'text-muted-foreground/40 hover:text-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
		]"
		:title="pinned ? 'Unpin from top' : 'Pin to top'"
		:aria-pressed="pinned ? 'true' : 'false'"
		@click.stop="$emit('toggle')"
	>
		<Icon
			name="lucide:pin"
			class="w-3.5 h-3.5 transition-transform"
			:class="pinned ? 'fill-current -rotate-45' : ''"
		/>
	</button>
</template>
