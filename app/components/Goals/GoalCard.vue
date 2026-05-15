<script setup>
const props = defineProps({
	goal: { type: Object, required: true },
});

const emit = defineEmits(['edit', 'update-progress', 'delete', 'coach']);

// Category styling (with legacy `type` fallback for un-migrated rows).
const categoryConfig = {
	revenue:   { label: 'Revenue',   icon: 'i-heroicons-banknotes',          color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
	growth:    { label: 'Growth',    icon: 'i-heroicons-arrow-trending-up',  color: 'text-blue-500',    bg: 'bg-blue-500/10' },
	retention: { label: 'Retention', icon: 'i-heroicons-heart',              color: 'text-pink-500',    bg: 'bg-pink-500/10' },
	learning:  { label: 'Learning',  icon: 'i-heroicons-academic-cap',       color: 'text-indigo-500',  bg: 'bg-indigo-500/10' },
	wellbeing: { label: 'Wellbeing', icon: 'i-heroicons-sun',                color: 'text-amber-500',   bg: 'bg-amber-500/10' },
	delivery:  { label: 'Delivery',  icon: 'i-heroicons-truck',              color: 'text-purple-500',  bg: 'bg-purple-500/10' },
	custom:    { label: 'Custom',    icon: 'i-heroicons-flag',               color: 'text-slate-500',   bg: 'bg-slate-500/10' },
};
const legacyTypeToCategory = {
	financial: 'revenue', networking: 'growth', performance: 'delivery', marketing: 'growth', custom: 'custom',
};

const scopeConfig = {
	user:         { label: 'For me',       icon: 'i-heroicons-user' },
	team:         { label: 'Team',         icon: 'i-heroicons-user-group' },
	client:       { label: 'Client',       icon: 'i-heroicons-briefcase' },
	organization: { label: 'Organization', icon: 'i-heroicons-building-office-2' },
};

const categoryInfo = computed(() => {
	const key = props.goal.category || legacyTypeToCategory[props.goal.type] || 'custom';
	return categoryConfig[key] || categoryConfig.custom;
});

const scopeInfo = computed(() => {
	const key = props.goal.scope || (props.goal.team ? 'team' : props.goal.client ? 'client' : props.goal.assigned_to ? 'user' : 'organization');
	return scopeConfig[key] || scopeConfig.organization;
});

const progress = computed(() => {
	if (!props.goal.target_value || props.goal.target_value === 0) return 0;
	return Math.min(100, Math.max(0, (props.goal.current_value || 0) / props.goal.target_value * 100));
});

const progressColor = computed(() => {
	if (progress.value >= 90) return 'bg-emerald-500';
	if (progress.value >= 50) return 'bg-blue-500';
	if (progress.value >= 25) return 'bg-amber-500';
	return 'bg-red-500';
});

const isOverdue = computed(() => {
	if (!props.goal.end_date || props.goal.status !== 'active') return false;
	return new Date(props.goal.end_date) < new Date();
});

const daysRemaining = computed(() => {
	if (!props.goal.end_date) return null;
	const diff = Math.ceil((new Date(props.goal.end_date).getTime() - Date.now()) / 86400000);
	return diff;
});

const formatValue = (val) => {
	if (!val && val !== 0) return '—';
	const unit = props.goal.target_unit;
	if (unit === 'USD' || unit === 'usd' || unit === '$') return `$${Number(val).toLocaleString()}`;
	if (unit === 'percent' || unit === '%') return `${val}%`;
	return `${Number(val).toLocaleString()} ${unit || ''}`.trim();
};

// Uses getFriendlyDateThree from utils/dates.ts
const formatDate = (dateStr) => getFriendlyDateThree(dateStr);
</script>

<template>
	<div class="goal-card group" :class="{ 'goal-card--overdue': isOverdue }">
		<!-- Header -->
		<div class="flex items-start justify-between gap-3 mb-3">
			<div class="flex items-center gap-2.5 min-w-0">
				<div class="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" :class="categoryInfo.bg">
					<UIcon :name="categoryInfo.icon" class="w-4 h-4" :class="categoryInfo.color" />
				</div>
				<div class="min-w-0">
					<h3 class="text-sm font-semibold text-foreground truncate">{{ goal.title }}</h3>
					<p v-if="goal.description" class="text-xs text-muted-foreground line-clamp-1 mt-0.5">{{ goal.description }}</p>
				</div>
			</div>
			<UDropdown :items="[
				[{ label: 'Update Progress', icon: 'i-heroicons-arrow-trending-up', click: () => emit('update-progress', goal) }],
				[{ label: 'Coach me', icon: 'i-heroicons-sparkles', click: () => emit('coach', goal) }],
				[{ label: 'Edit', icon: 'i-heroicons-pencil-square', click: () => emit('edit', goal) }],
				[{ label: 'Delete', icon: 'i-heroicons-trash', click: () => emit('delete', goal) }],
			]">
				<button class="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-muted">
					<UIcon name="i-heroicons-ellipsis-vertical" class="w-4 h-4 text-muted-foreground" />
				</button>
			</UDropdown>
		</div>

		<!-- Progress -->
		<div class="mb-3">
			<div class="flex items-center justify-between text-xs mb-1.5">
				<span class="text-muted-foreground">{{ formatValue(goal.current_value) }} / {{ formatValue(goal.target_value) }}</span>
				<span class="font-semibold" :class="progress >= 90 ? 'text-emerald-500' : progress >= 50 ? 'text-blue-500' : 'text-muted-foreground'">
					{{ Math.round(progress) }}%
				</span>
			</div>
			<div class="h-1.5 bg-muted rounded-full overflow-hidden">
				<div class="h-full rounded-full transition-all duration-500" :class="progressColor" :style="{ width: progress + '%' }" />
			</div>
		</div>

		<!-- Footer -->
		<div class="flex items-center justify-between gap-2">
			<div class="flex items-center gap-1.5 min-w-0">
				<span
					class="inline-flex items-center gap-1 text-[10px] font-medium tracking-wider px-1.5 py-0.5 rounded-md"
					:class="[categoryInfo.bg, categoryInfo.color]"
				>
					<UIcon :name="categoryInfo.icon" class="w-3 h-3" />
					{{ categoryInfo.label }}
				</span>
				<span
					class="inline-flex items-center gap-1 text-[10px] font-medium tracking-wider px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground"
				>
					<UIcon :name="scopeInfo.icon" class="w-3 h-3" />
					{{ scopeInfo.label }}
				</span>
			</div>
			<div class="text-[10px] text-muted-foreground shrink-0">
				<span v-if="isOverdue" class="text-red-500 font-medium">Overdue</span>
				<span v-else-if="daysRemaining !== null && daysRemaining >= 0">{{ daysRemaining }}d left</span>
				<span v-else-if="goal.end_date">{{ formatDate(goal.end_date) }}</span>
				<span v-else-if="goal.timeframe" class="capitalize">{{ goal.timeframe }}</span>
			</div>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.goal-card {
	background: hsl(var(--card));
	border: 1px solid hsl(var(--border) / 0.5);
	border-radius: 16px;
	padding: 16px;
	transition: all 0.2s ease;
}
.goal-card:hover {
	border-color: hsl(var(--border));
	box-shadow: 0 2px 8px hsl(var(--foreground) / 0.04);
}
.goal-card--overdue {
	border-color: hsl(var(--destructive) / 0.3);
}
</style>
