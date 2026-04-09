<template>
	<div class="ios-card p-5">
		<div class="flex items-center gap-2 mb-3">
			<UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-amber-500" />
			<h3 class="text-sm font-semibold text-foreground">{{ motivationTitle }}</h3>
		</div>

		<p class="text-[13px] text-muted-foreground leading-relaxed">{{ motivationMessage }}</p>

		<!-- Streak -->
		<div v-if="streak > 0" class="mt-4 flex items-center gap-2 p-2.5 rounded-lg bg-orange-50 dark:bg-orange-900/10">
			<span class="text-lg">🔥</span>
			<div>
				<p class="text-xs font-semibold text-orange-600 dark:text-orange-400">{{ streak }}-day streak</p>
				<p class="text-[10px] text-orange-500/70 dark:text-orange-400/60">Keep it going!</p>
			</div>
		</div>

		<!-- Today's stats -->
		<div class="mt-4 grid grid-cols-2 gap-3">
			<div class="text-center p-2 rounded-lg bg-muted/30">
				<p class="text-lg font-bold text-foreground">{{ tasksCompleted }}</p>
				<p class="text-[10px] text-muted-foreground">Tasks Done</p>
			</div>
			<div class="text-center p-2 rounded-lg bg-muted/30">
				<p class="text-lg font-bold text-foreground">{{ currentScore }}</p>
				<p class="text-[10px] text-muted-foreground">Earnest Score</p>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	greeting: string;
	tasksCompleted: number;
	currentScore: number;
	streak: number;
}>();

const motivationTitle = computed(() => {
	if (props.tasksCompleted >= 5) return 'On Fire!';
	if (props.tasksCompleted >= 3) return 'Great Progress!';
	if (props.tasksCompleted >= 1) return 'Nice Start!';
	return 'Ready to Go!';
});

const motivationMessage = computed(() => {
	if (props.tasksCompleted >= 5) return `${props.tasksCompleted} tasks completed today — you're crushing it! Keep the momentum going.`;
	if (props.tasksCompleted >= 3) return `${props.tasksCompleted} tasks done so far. You're building great momentum today.`;
	if (props.tasksCompleted >= 1) return `${props.tasksCompleted} task${props.tasksCompleted > 1 ? 's' : ''} completed. Every step counts — keep going!`;
	return "Fresh day, fresh start. Let's make it count!";
});
</script>
