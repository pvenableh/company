<!--
  ModeToggle — one pill toggle for the home mode: Focus (the calm presence
  landing) vs Classic (command-center-first). Replaces the two separate
  "Try the calm home" / "Use the classic home" text buttons.
-->
<script setup lang="ts">
const { isPresence, setMode } = useHomeMode();

const options = [
	{ key: 'presence', label: 'Focus' },
	{ key: 'classic', label: 'Classic' },
] as const;

const isActive = (key: string) => (key === 'presence') === isPresence.value;
</script>

<template>
	<div
		class="inline-flex items-center rounded-full border border-border bg-muted/40 p-0.5 text-[11px] font-medium"
		role="group"
		aria-label="Home mode"
	>
		<button
			v-for="o in options"
			:key="o.key"
			type="button"
			class="px-3 py-1 rounded-full transition-colors"
			:class="isActive(o.key)
				? 'bg-primary text-primary-foreground'
				: 'text-muted-foreground hover:text-foreground'"
			:aria-pressed="isActive(o.key)"
			@click="setMode(o.key)"
		>
			{{ o.label }}
		</button>
	</div>
</template>
