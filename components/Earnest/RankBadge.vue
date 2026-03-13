<template>
	<span
		v-if="rank !== null && teamSize !== null"
		class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums"
		:class="rank <= 3 ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground'"
	>
		<UIcon name="i-heroicons-user-group-16-solid" class="w-3 h-3" />
		#{{ rank }} of {{ teamSize }}
	</span>
</template>

<script setup lang="ts">
defineProps<{
	rank: number | null;
	teamSize: number | null;
}>();
</script>
