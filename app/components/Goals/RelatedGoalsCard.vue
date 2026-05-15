<script setup lang="ts">
// RelatedGoalsCard — slim "goals in this lens" card on each /apps/<id> index page.
// Stage 1.5 of the "Me" lens initiative. Each app surfaces goals matching its
// lens (Money → revenue/retention, Work → delivery, etc.) with a "See all" link
// to /goals pre-filtered by the primary category. Hidden when zero matches.
import type { Goal, GoalCategory } from '~~/shared/directus';

const props = defineProps<{
	categories: GoalCategory[];
	title?: string;
	limit?: number;
}>();

const router = useRouter();
const { activeGoals, goalProgress, isLoading } = useGoals();

const categoryConfig: Record<string, { icon: string; color: string }> = {
	revenue: { icon: 'i-heroicons-banknotes', color: 'text-emerald-500' },
	growth: { icon: 'i-heroicons-arrow-trending-up', color: 'text-blue-500' },
	retention: { icon: 'i-heroicons-heart', color: 'text-pink-500' },
	learning: { icon: 'i-heroicons-academic-cap', color: 'text-indigo-500' },
	wellbeing: { icon: 'i-heroicons-sun', color: 'text-amber-500' },
	delivery: { icon: 'i-heroicons-truck', color: 'text-purple-500' },
	custom: { icon: 'i-heroicons-flag', color: 'text-amber-500' },
};

const legacyTypeToCategory: Record<string, GoalCategory> = {
	financial: 'revenue',
	networking: 'growth',
	performance: 'delivery',
	marketing: 'growth',
	custom: 'custom',
};

const categoryOf = (g: Goal): GoalCategory => {
	if (g.category) return g.category;
	if (g.type && legacyTypeToCategory[g.type]) return legacyTypeToCategory[g.type];
	return 'custom';
};

const matchingGoals = computed<Goal[]>(() => {
	const set = new Set(props.categories);
	return activeGoals.value
		.filter((g) => set.has(categoryOf(g)))
		.sort((a, b) => {
			// Overdue first, then by lowest progress so the "needs attention" goals lead.
			const now = Date.now();
			const aOver = a.end_date && new Date(a.end_date).getTime() < now ? 1 : 0;
			const bOver = b.end_date && new Date(b.end_date).getTime() < now ? 1 : 0;
			if (aOver !== bOver) return bOver - aOver;
			return goalProgress(a) - goalProgress(b);
		});
});

const topGoals = computed<Goal[]>(() => matchingGoals.value.slice(0, props.limit ?? 3));

const primaryCategory = computed<GoalCategory | null>(() => props.categories[0] ?? null);
const seeAllHref = computed(() => {
	const cat = primaryCategory.value;
	return cat ? `/goals?category=${cat}` : '/goals';
});

const progressColor = (pct: number) => {
	if (pct >= 90) return 'bg-emerald-500';
	if (pct >= 50) return 'bg-blue-500';
	if (pct >= 25) return 'bg-amber-500';
	return 'bg-red-500';
};

const visible = computed(() => !isLoading.value && matchingGoals.value.length > 0);
</script>

<template>
	<section v-if="visible" class="related-goals-card ios-card" aria-labelledby="related-goals-title">
		<div class="related-goals-card__head">
			<div class="related-goals-card__title-row">
				<Icon name="lucide:flag" class="w-3.5 h-3.5 text-muted-foreground" />
				<h3 id="related-goals-title" class="related-goals-card__title">
					{{ title || 'Related goals' }}
				</h3>
				<span class="related-goals-card__count">{{ matchingGoals.length }}</span>
			</div>
			<NuxtLink :to="seeAllHref" class="related-goals-card__see-all">
				See all
				<Icon name="lucide:arrow-right" class="w-3 h-3" />
			</NuxtLink>
		</div>

		<ul class="related-goals-card__list">
			<li
				v-for="goal in topGoals"
				:key="goal.id"
				class="related-goals-card__row"
				@click="router.push(seeAllHref)"
			>
				<UIcon
					:name="categoryConfig[categoryOf(goal)]?.icon || categoryConfig.custom.icon"
					class="w-3.5 h-3.5 shrink-0"
					:class="categoryConfig[categoryOf(goal)]?.color || categoryConfig.custom.color"
				/>
				<span class="related-goals-card__row-title" :title="goal.title">{{ goal.title }}</span>
				<div class="related-goals-card__bar">
					<div
						class="related-goals-card__bar-fill"
						:class="progressColor(goalProgress(goal))"
						:style="{ width: goalProgress(goal) + '%' }"
					></div>
				</div>
				<span class="related-goals-card__pct">{{ Math.round(goalProgress(goal)) }}%</span>
			</li>
		</ul>
	</section>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.related-goals-card {
	@apply mb-5 px-3 py-2.5 sm:px-4 sm:py-3;
}

.related-goals-card__head {
	@apply flex items-center justify-between mb-2;
}

.related-goals-card__title-row {
	@apply flex items-center gap-1.5;
}

.related-goals-card__title {
	@apply text-xs font-semibold uppercase tracking-wide text-foreground/70;
}

.related-goals-card__count {
	@apply text-[10px] font-medium text-muted-foreground bg-muted/40 rounded-full px-1.5 py-0.5;
}

.related-goals-card__see-all {
	@apply inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors;
}

.related-goals-card__list {
	@apply space-y-1.5;
}

.related-goals-card__row {
	@apply flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-muted/30 cursor-pointer transition-colors;
}

.related-goals-card__row-title {
	@apply text-xs font-medium text-foreground truncate min-w-0 flex-1;
}

.related-goals-card__bar {
	@apply h-1 w-20 sm:w-32 bg-muted rounded-full overflow-hidden shrink-0;
}

.related-goals-card__bar-fill {
	@apply h-full rounded-full transition-all duration-300;
}

.related-goals-card__pct {
	@apply text-[10px] font-medium text-muted-foreground w-7 text-right shrink-0;
}
</style>
