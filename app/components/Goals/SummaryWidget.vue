<script setup>
const { activeGoals, overdueGoals, goalProgress, isLoading } = useGoals();
const router = useRouter();

const topGoals = computed(() => {
	// Show up to 4 active goals, prioritizing overdue then by progress
	return [...activeGoals.value]
		.sort((a, b) => {
			const aOverdue = a.end_date && new Date(a.end_date) < new Date() ? 1 : 0;
			const bOverdue = b.end_date && new Date(b.end_date) < new Date() ? 1 : 0;
			if (aOverdue !== bOverdue) return bOverdue - aOverdue;
			return goalProgress(a) - goalProgress(b);
		})
		.slice(0, 4);
});

const avgProgress = computed(() => {
	if (!activeGoals.value.length) return 0;
	return Math.round(activeGoals.value.reduce((sum, g) => sum + goalProgress(g), 0) / activeGoals.value.length);
});

const typeConfig = {
	financial: { icon: 'i-heroicons-banknotes', color: 'text-emerald-500' },
	networking: { icon: 'i-heroicons-user-group', color: 'text-blue-500' },
	performance: { icon: 'i-heroicons-chart-bar', color: 'text-purple-500' },
	marketing: { icon: 'i-heroicons-megaphone', color: 'text-pink-500' },
	custom: { icon: 'i-heroicons-flag', color: 'text-amber-500' },
};

const progressColor = (pct) => {
	if (pct >= 90) return 'bg-emerald-500';
	if (pct >= 50) return 'bg-blue-500';
	if (pct >= 25) return 'bg-amber-500';
	return 'bg-red-500';
};
</script>

<template>
	<div class="ios-card p-5">
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<UIcon name="i-heroicons-flag" class="w-5 h-5 text-amber-500" />
				<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">Goals</h3>
			</div>
			<button
				@click="router.push('/goals')"
				class="text-xs text-primary hover:underline"
			>
				View All
			</button>
		</div>

		<!-- Loading -->
		<div v-if="isLoading && !activeGoals.length" class="space-y-3">
			<div v-for="i in 3" :key="i" class="h-10 bg-muted/30 rounded-lg animate-pulse" />
		</div>

		<!-- Empty -->
		<div v-else-if="!activeGoals.length" class="text-center py-6">
			<UIcon name="i-heroicons-flag" class="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
			<p class="text-xs text-muted-foreground">No active goals</p>
			<button
				@click="router.push('/goals')"
				class="mt-2 text-xs text-primary hover:underline"
			>
				Create a Goal
			</button>
		</div>

		<!-- Goals list -->
		<div v-else class="space-y-3">
			<!-- Summary bar -->
			<div class="flex items-center justify-between text-xs mb-1">
				<span class="text-muted-foreground">{{ activeGoals.length }} active</span>
				<span class="font-medium" :class="avgProgress >= 50 ? 'text-emerald-500' : 'text-muted-foreground'">{{ avgProgress }}% avg</span>
			</div>

			<!-- Goal items -->
			<div
				v-for="goal in topGoals"
				:key="goal.id"
				class="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
				@click="router.push('/goals')"
			>
				<UIcon
					:name="(typeConfig[goal.type] || typeConfig.custom).icon"
					class="w-4 h-4 flex-shrink-0"
					:class="(typeConfig[goal.type] || typeConfig.custom).color"
				/>
				<div class="flex-1 min-w-0">
					<p class="text-xs font-medium text-foreground truncate">{{ goal.title }}</p>
					<div class="flex items-center gap-2 mt-1">
						<div class="flex-1 h-1 bg-muted rounded-full overflow-hidden">
							<div
								class="h-full rounded-full transition-all duration-500"
								:class="progressColor(goalProgress(goal))"
								:style="{ width: goalProgress(goal) + '%' }"
							/>
						</div>
						<span class="text-[10px] font-medium text-muted-foreground w-7 text-right">{{ Math.round(goalProgress(goal)) }}%</span>
					</div>
				</div>
			</div>

			<!-- Overdue warning -->
			<div v-if="overdueGoals.length" class="flex items-center gap-1.5 text-xs text-red-500 mt-1">
				<UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5" />
				<span>{{ overdueGoals.length }} overdue goal{{ overdueGoals.length > 1 ? 's' : '' }}</span>
			</div>
		</div>
	</div>
</template>
