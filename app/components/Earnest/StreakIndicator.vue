<template>
	<div v-if="streak > 0" class="flex items-center gap-1.5">
		<span class="earnest-flame text-base">{{ streak >= 7 ? '🔥' : '✨' }}</span>
		<span class="text-xs font-medium text-foreground tabular-nums">{{ streak }}-day streak</span>
		<span v-if="streak >= 30" class="text-[10px] text-primary font-semibold uppercase tracking-wider">Pillar</span>
		<span v-else-if="streak >= 7" class="text-[10px] text-amber-500 font-semibold uppercase tracking-wider">Resolve</span>
	</div>
	<div v-else class="flex items-center gap-1.5">
		<span class="text-base opacity-40">✨</span>
		<span class="text-xs text-muted-foreground">Start today</span>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	streak: number;
}>();
</script>

<style scoped>
.earnest-flame {
	animation: earnest-glow 1.8s ease-in-out infinite;
}

@keyframes earnest-glow {
	0%, 100% { transform: scale(1); opacity: 1; }
	50% { transform: scale(1.15); opacity: 0.85; }
}
</style>
