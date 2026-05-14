<script setup lang="ts">
// Stage 2.5 — weekly check-in trigger pill.
// Renders ONLY when the user has >=1 stale scope=user goal (active, created
// >=7 days ago, no snapshot in last 7 days). Quiet state = no DOM at all.
const emit = defineEmits<{ open: [] }>();
const { staleUserGoals } = useGoals();

const count = computed(() => staleUserGoals.value.length);
const copy = computed(() => {
	const n = count.value;
	if (n === 1) return '1 goal hasn’t been updated in 7 days.';
	return `${n} goals haven’t been updated in 7 days.`;
});
</script>

<template>
	<button
		v-if="count > 0"
		type="button"
		class="w-full flex items-center gap-2 px-3 py-2 rounded-full bg-amber-500/10 hover:bg-amber-500/20 ring-1 ring-amber-500/20 transition-colors text-left"
		@click="emit('open')"
	>
		<UIcon name="i-heroicons-clock" class="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
		<span class="text-[11px] font-medium text-foreground/80 truncate">{{ copy }}</span>
		<span class="ml-auto text-[10px] font-semibold text-amber-700 whitespace-nowrap">Check in &rarr;</span>
	</button>
</template>
