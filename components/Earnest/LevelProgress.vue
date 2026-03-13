<template>
	<div class="space-y-1">
		<div class="flex items-center justify-between text-xs">
			<div class="flex items-center gap-1.5">
				<span class="font-semibold text-foreground">Lvl {{ level }}</span>
				<span class="text-muted-foreground">&middot;</span>
				<span class="text-muted-foreground">{{ title }}</span>
			</div>
			<span class="text-muted-foreground tabular-nums">{{ totalEP.toLocaleString() }} / {{ nextLevelEP.toLocaleString() }} EP</span>
		</div>
		<div class="h-1.5 rounded-full bg-muted/50 overflow-hidden">
			<div
				class="h-full rounded-full bg-primary transition-all duration-700 ease-out"
				:style="{ width: `${progress}%` }"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	level: number;
	title: string;
	totalEP: number;
	nextLevelEP: number;
	progress: number;
}>();
</script>
