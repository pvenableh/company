<template>
	<!-- Compact mode: sidebar widget -->
	<div v-if="compact" class="px-3 py-2 cursor-pointer group" @click="navigateToBilling">
		<div class="flex items-center justify-between mb-1.5">
			<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">AI Tokens</span>
			<span class="text-[10px] font-medium" :class="colorClass">{{ usagePercent }}% used</span>
		</div>
		<div class="h-1.5 rounded-full bg-muted/50 overflow-hidden">
			<div
				class="h-full rounded-full transition-all duration-500"
				:class="barColorClass"
				:style="{ width: `${Math.min(usagePercent, 100)}%` }"
			/>
		</div>
	</div>

	<!-- Full mode: billing page widget -->
	<div v-else class="ios-card p-4 space-y-4">
		<div class="flex items-center justify-between">
			<h4 class="text-sm font-semibold text-foreground">Token Usage</h4>
			<span class="text-[10px] font-medium px-2 py-0.5 rounded-full" :class="badgeClass">
				{{ usagePercent }}% used
			</span>
		</div>

		<!-- Progress bar -->
		<div class="h-2.5 rounded-full bg-muted/50 overflow-hidden">
			<div
				class="h-full rounded-full transition-all duration-500"
				:class="barColorClass"
				:style="{ width: `${Math.min(usagePercent, 100)}%` }"
			/>
		</div>

		<!-- Stats -->
		<div class="grid grid-cols-3 gap-3">
			<div>
				<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Monthly Allotment</span>
				<p class="text-sm font-bold text-foreground">{{ formatTokens(summary?.orgLimit) }}</p>
			</div>
			<div>
				<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Balance</span>
				<p class="text-sm font-bold" :class="colorClass">{{ formatTokens(summary?.orgBalance) }}</p>
			</div>
			<div>
				<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Used This Period</span>
				<p class="text-sm font-bold text-foreground">{{ formatTokens(summary?.orgTokensUsed ?? 0) }}</p>
			</div>
		</div>

		<!-- CTA when approaching limit -->
		<div v-if="showCta && usagePercent >= 80 && usagePercent < 100" class="pt-1">
			<button
				class="w-full px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
				@click="$emit('topup')"
			>
				Buy More Tokens
			</button>
		</div>

		<!-- Depleted state -->
		<div v-if="usagePercent >= 100" class="flex items-center gap-2 p-3 rounded-lg bg-destructive/10">
			<UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-destructive flex-shrink-0" />
			<p class="text-xs text-destructive">
				Token balance depleted. <button class="underline font-medium" @click="$emit('topup')">Purchase more tokens</button> to continue using AI features.
			</p>
		</div>
	</div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
	compact?: boolean;
	showCta?: boolean;
}>(), {
	compact: false,
	showCta: true,
});

defineEmits<{
	topup: [];
}>();

const router = useRouter();
const { usageSummary } = useAITokens();

const summary = computed(() => usageSummary.value);

const usagePercent = computed(() => {
	const s = summary.value;
	if (!s || s.orgLimit === null || s.orgLimit === 0) return 0;
	const used = s.orgTokensUsed ?? 0;
	return Math.round((used / s.orgLimit) * 100);
});

// Color logic: green 0-69%, amber 70-89%, red 90-100%
const colorClass = computed(() => {
	if (usagePercent.value >= 90) return 'text-destructive';
	if (usagePercent.value >= 70) return 'text-amber-500';
	return 'text-emerald-500';
});

const barColorClass = computed(() => {
	if (usagePercent.value >= 90) return 'bg-destructive';
	if (usagePercent.value >= 70) return 'bg-amber-500';
	return 'bg-emerald-500';
});

const badgeClass = computed(() => {
	if (usagePercent.value >= 90) return 'bg-destructive/10 text-destructive';
	if (usagePercent.value >= 70) return 'bg-amber-500/10 text-amber-500';
	return 'bg-emerald-500/10 text-emerald-500';
});

function formatTokens(value: number | null | undefined): string {
	if (value === null || value === undefined) return 'Unlimited';
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
	return value.toLocaleString();
}

function navigateToBilling() {
	router.push('/account/billing');
}
</script>
