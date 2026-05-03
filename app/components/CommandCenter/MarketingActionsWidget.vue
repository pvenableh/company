<template>
	<NuxtLink
		to="/marketing-feed"
		class="ios-card p-5 block group"
	>
		<!-- Header -->
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<UIcon name="i-heroicons-megaphone" class="w-5 h-5 text-primary" />
				<h3 class="text-sm font-semibold uppercase tracking-wider text-foreground/70">Marketing</h3>
			</div>
			<span
				v-if="!loading && pendingCount > 0"
				class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold uppercase tracking-wider"
			>
				{{ pendingCount }} ready
			</span>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="space-y-2">
			<div class="h-4 w-3/4 bg-muted rounded animate-pulse" />
			<div class="h-3 w-1/2 bg-muted/60 rounded animate-pulse" />
		</div>

		<!-- Empty -->
		<div v-else-if="pendingCount === 0" class="flex items-center gap-3 py-1">
			<div class="w-8 h-8 rounded-full bg-muted/40 flex items-center justify-center flex-shrink-0">
				<UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-muted-foreground/60" />
			</div>
			<div>
				<p class="text-sm text-foreground/80 font-medium">No marketing actions this week</p>
				<p class="text-[11px] text-muted-foreground mt-0.5">Earnest will surface ideas as your CRM fills out.</p>
			</div>
		</div>

		<!-- Top recommendation preview -->
		<div v-else class="space-y-3">
			<div class="flex items-start gap-3">
				<div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
					<UIcon :name="cardTypeIcon(topRec?.card_type)" class="w-4 h-4 text-primary" />
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-medium text-foreground truncate">{{ topHeadline }}</p>
					<p
						v-if="topReason"
						class="text-[11px] text-muted-foreground mt-0.5 line-clamp-2"
					>
						{{ topReason }}
					</p>
				</div>
				<span
					v-if="topUrgency !== null"
					class="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md flex-shrink-0"
					:class="urgencyChipClass(topUrgency)"
				>
					{{ urgencyLabel(topUrgency) }}
				</span>
			</div>

			<div class="flex items-center justify-between pt-2 border-t border-border/30">
				<span class="text-[11px] text-muted-foreground">
					<template v-if="pendingCount > 1">+{{ pendingCount - 1 }} more</template>
					<template v-else>Tap to review</template>
				</span>
				<span class="text-[11px] font-medium text-primary flex items-center gap-1 group-hover:gap-1.5 transition-all">
					Open feed
					<UIcon name="i-heroicons-arrow-right" class="w-3 h-3" />
				</span>
			</div>
		</div>
	</NuxtLink>
</template>

<script setup lang="ts">
import type { MarketingRecommendation } from '~~/shared/marketing-persistence';

const { selectedOrg } = useOrganization();

const recommendations = ref<MarketingRecommendation[]>([]);
const loading = ref(false);

const pendingCount = computed(() =>
	recommendations.value.filter(r => r.status === 'pending' || r.status === 'drafted').length,
);

const topRec = computed<MarketingRecommendation | null>(() => {
	const active = recommendations.value
		.filter(r => r.status === 'pending' || r.status === 'drafted')
		.slice()
		.sort((a, b) => (b.ranker_output?.urgency ?? 0) - (a.ranker_output?.urgency ?? 0));
	return active[0] ?? null;
});

const topUrgency = computed(() => topRec.value?.ranker_output?.urgency ?? null);
const topReason = computed(() => topRec.value?.ranker_output?.why_now ?? '');

const topHeadline = computed(() => {
	const rec = topRec.value;
	if (!rec) return '';
	const data = (rec.candidate_data || {}) as any;
	const audienceSize = data?.audience?.size ?? 0;
	switch (rec.card_type) {
		case 'dormant_clients':
			return `Reach out to ${audienceSize} dormant ${audienceSize === 1 ? 'client' : 'clients'}`;
		case 'project_complete': {
			const phase = data?.phase as string | undefined;
			const contact = data?.signal?.primary_contact_name as string | undefined;
			const project = data?.signal?.project_title as string | undefined;
			if (phase === 'request_testimonial' && contact) return `Ask ${contact} for a testimonial`;
			if (project) return `Turn ${project} into a campaign`;
			return 'Surface a recent win';
		}
		case 'lead_reengagement': {
			const topic = data?.cluster?.label as string | undefined;
			const count = data?.cluster?.size ?? audienceSize;
			if (topic)
				return `Re-engage ${count} ${topic.toLowerCase()} ${count === 1 ? 'lead' : 'leads'}`;
			return `Re-engage ${count} quiet ${count === 1 ? 'lead' : 'leads'}`;
		}
		default:
			return 'Take action';
	}
});

function cardTypeIcon(type?: string): string {
	switch (type) {
		case 'dormant_clients': return 'i-heroicons-user-group';
		case 'project_complete': return 'i-heroicons-trophy';
		case 'lead_reengagement': return 'i-heroicons-funnel';
		default: return 'i-heroicons-megaphone';
	}
}

function urgencyLabel(u: number): string {
	if (u >= 0.75) return 'Urgent';
	if (u >= 0.5) return 'High';
	if (u >= 0.25) return 'Med';
	return 'Low';
}

function urgencyChipClass(u: number): string {
	if (u >= 0.75) return 'bg-rose-500/10 text-rose-600';
	if (u >= 0.5) return 'bg-amber-500/10 text-amber-600';
	return 'bg-muted/40 text-muted-foreground';
}

async function load() {
	const orgId = selectedOrg.value;
	if (!orgId) {
		recommendations.value = [];
		return;
	}
	loading.value = true;
	try {
		const data = await $fetch<{ recommendations: MarketingRecommendation[] }>(
			'/api/marketing/recommendations',
			{ query: { organizationId: orgId } },
		);
		recommendations.value = data.recommendations || [];
	} catch {
		recommendations.value = [];
	} finally {
		loading.value = false;
	}
}

watch(selectedOrg, () => load(), { immediate: true });
</script>
