<!--
  MyGoalsCard — the personal-goals mini widget, extracted from the dashboard so
  it's an addressable, reorderable widget. Self-hides when the org has goals
  turned off. Reuses useGoals state already loaded by GoalsSummaryWidget, so it
  adds no extra fetch.
-->
<script setup lang="ts">
const { goalsEnabled } = useGoalsEnabled();
const { myGoals, goalProgress: goalProgressFn } = useGoals();

const topMyGoals = computed(() =>
	(myGoals.value || [])
		.filter((g: any) => g.status === 'active')
		.slice(0, 3),
);
</script>

<template>
	<div v-if="goalsEnabled" class="ios-card p-5">
		<div class="flex items-center justify-between mb-3">
			<div class="flex items-center gap-2">
				<EIcon name="i-heroicons-flag" class="w-4 h-4 text-warning" />
				<h3 class="text-xs font-semibold uppercase tracking-wide text-foreground/70">My Goals</h3>
			</div>
			<UiViewLink to="/goals?scope=user" size="sm">
				{{ topMyGoals.length > 0 ? 'View all' : 'Set one' }}
			</UiViewLink>
		</div>
		<div v-if="topMyGoals.length === 0" class="py-3 text-center">
			<p class="text-xs text-muted-foreground">No personal goals yet.</p>
			<p class="text-[10px] text-muted-foreground/70 mt-0.5">Set one to track what's yours.</p>
		</div>
		<div v-else class="space-y-3">
			<NuxtLink
				v-for="g in topMyGoals"
				:key="g.id"
				:to="`/goals?id=${g.id}`"
				class="block group"
			>
				<div class="flex items-center justify-between gap-2 mb-1">
					<p class="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">{{ g.title }}</p>
					<span class="text-[10px] font-medium text-muted-foreground tabular-nums">{{ Math.round(goalProgressFn(g)) }}%</span>
				</div>
				<div class="h-1.5 bg-muted/40 rounded-full overflow-hidden">
					<div
						class="h-full rounded-full transition-all duration-500"
						:class="{
							'bg-success': goalProgressFn(g) >= 90,
							'bg-blue-500': goalProgressFn(g) >= 50 && goalProgressFn(g) < 90,
							'bg-warning': goalProgressFn(g) >= 25 && goalProgressFn(g) < 50,
							'bg-destructive': goalProgressFn(g) < 25,
						}"
						:style="{ width: `${Math.max(goalProgressFn(g), 4)}%` }"
					/>
				</div>
			</NuxtLink>
		</div>
	</div>
</template>
