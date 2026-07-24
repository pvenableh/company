<template>
	<div class="ios-card p-5">
		<!-- Header row -->
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<EIcon name="i-heroicons-megaphone" class="w-5 h-5 text-primary" />
				<h3 class="text-sm font-semibold uppercase tracking-wider text-foreground/70">
					Marketing &amp; Social Pulse
				</h3>
			</div>
			<div class="flex items-center gap-2">
				<span
					v-if="pulse.pendingCount.value > 0"
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold uppercase tracking-wider"
				>
					{{ pulse.pendingCount.value }} ready
				</span>
				<span
					v-if="metrics?.failedPosts && metrics.failedPosts > 0"
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[10px] font-semibold uppercase tracking-wider"
				>
					<EIcon name="i-heroicons-exclamation-triangle" class="w-3 h-3" />
					{{ metrics.failedPosts }} failed
				</span>
				<UiViewLink to="/apps/marketing" size="sm">View marketing</UiViewLink>
			</div>
		</div>

		<!-- Body: split into recommendation + KPI strip -->
		<div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)] gap-5 lg:gap-6 lg:items-stretch">
			<!-- LEFT: Recommendation -->
			<NuxtLink
				to="/marketing"
				class="group rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors p-4 block"
			>
				<div v-if="pulse.loading.value && !pulse.topRec.value" class="space-y-2">
					<div class="h-4 w-3/4 bg-muted rounded animate-pulse" />
					<div class="h-3 w-1/2 bg-muted/60 rounded animate-pulse" />
				</div>

				<div v-else-if="!pulse.topRec.value" class="flex items-center gap-3 h-full">
					<div class="w-9 h-9 rounded-full bg-muted/40 flex items-center justify-center flex-shrink-0">
						<EIcon name="i-heroicons-check-circle" class="w-5 h-5 text-muted-foreground/60" />
					</div>
					<div>
						<p class="text-sm font-medium text-foreground/80">No marketing actions this week</p>
						<p class="text-[11px] text-muted-foreground mt-0.5">
							Earnest will surface ideas as your CRM fills out.
						</p>
					</div>
				</div>

				<div v-else class="flex flex-col h-full">
					<div class="flex items-start gap-3">
						<div class="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
							<EIcon :name="cardTypeIcon(pulse.topRec.value.card_type)" class="w-5 h-5 text-primary" />
						</div>
						<div class="flex-1 min-w-0">
							<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
								Top recommendation
							</p>
							<p class="text-sm font-semibold text-foreground line-clamp-2">{{ topHeadline }}</p>
							<p
								v-if="topReason"
								class="text-[11px] text-muted-foreground mt-1 line-clamp-2"
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

					<div class="mt-auto pt-3 flex items-center justify-between">
						<span class="text-[11px] text-muted-foreground">
							<template v-if="pulse.pendingCount.value > 1">
								+{{ pulse.pendingCount.value - 1 }} more queued
							</template>
							<template v-else>Tap to review</template>
						</span>
						<span class="text-[11px] font-medium text-primary flex items-center gap-1 group-hover:gap-1.5 transition-all">
							Open feed
							<EIcon name="i-heroicons-arrow-right" class="w-3 h-3" />
						</span>
					</div>
				</div>
			</NuxtLink>

			<!-- RIGHT: KPI grid -->
			<div class="grid gap-3" :class="kpiGridClass">
				<NuxtLink
					v-for="kpi in kpis"
					:key="kpi.key"
					:to="kpi.to"
					class="rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors p-3 flex flex-col gap-1 group"
				>
					<div class="flex items-center gap-1.5">
						<EIcon :name="kpi.icon" class="w-3.5 h-3.5 text-muted-foreground" />
						<span class="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
							{{ kpi.label }}
						</span>
					</div>
					<p class="text-xl font-semibold text-foreground tabular-nums leading-none mt-1">
						{{ kpi.value }}
					</p>
					<p
						v-if="kpi.sublabel"
						class="text-[11px] mt-auto"
						:class="kpi.tone === 'positive' ? 'text-success dark:text-success' : 'text-muted-foreground'"
					>
						{{ kpi.sublabel }}
					</p>
				</NuxtLink>
			</div>
		</div>

		<!-- Connected platforms strip -->
		<div
			v-if="pulse.socialAccounts.value.length > 0"
			class="mt-4 pt-3 border-t border-border/30 flex items-center justify-between gap-3"
		>
			<div class="flex items-center gap-2 min-w-0">
				<span class="text-[10px] uppercase tracking-wider text-muted-foreground flex-shrink-0">
					Connected
				</span>
				<div class="flex items-center gap-1.5 flex-wrap">
					<span
						v-for="account in pulse.socialAccounts.value.slice(0, 6)"
						:key="account.id"
						class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/30 text-[11px]"
					>
						<EIcon :name="platformIcon(account.platform)" class="w-3 h-3" />
						<span class="truncate max-w-[140px]">{{ account.account_name }}</span>
					</span>
					<span
						v-if="pulse.socialAccounts.value.length > 6"
						class="text-[11px] text-muted-foreground"
					>
						+{{ pulse.socialAccounts.value.length - 6 }}
					</span>
				</div>
			</div>
			<UiViewLink to="/social" size="sm" class="flex-shrink-0">Open social</UiViewLink>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { MarketingRecommendation } from '~~/shared/marketing-persistence';

const pulse = useMarketingPulse();
const metrics = computed(() => pulse.metrics.value);

const topUrgency = computed(() => pulse.topRec.value?.ranker_output?.urgency ?? null);
const topReason = computed(() => pulse.topRec.value?.ranker_output?.why_now ?? '');

const topHeadline = computed(() => {
	const rec = pulse.topRec.value;
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
			if (topic) return `Re-engage ${count} ${topic.toLowerCase()} ${count === 1 ? 'lead' : 'leads'}`;
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
	if (u >= 0.75) return 'bg-destructive/10 text-destructive';
	if (u >= 0.5) return 'bg-warning/10 text-warning';
	return 'bg-muted/40 text-muted-foreground';
}

function platformIcon(platform: string): string {
	switch (platform) {
		case 'instagram': return 'logos:instagram-icon';
		case 'facebook': return 'logos:facebook';
		case 'linkedin': return 'logos:linkedin-icon';
		case 'tiktok': return 'logos:tiktok-icon';
		case 'threads': return 'logos:threads-icon';
		default: return 'i-heroicons-globe-alt';
	}
}

function compactNumber(n: number | null | undefined): string {
	if (!n || n <= 0) return '0';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
	return String(n);
}

interface KPI {
	key: string;
	label: string;
	value: string;
	sublabel?: string;
	icon: string;
	to: string;
	tone?: 'positive' | 'neutral';
}

const kpis = computed<KPI[]>(() => {
	const m = metrics.value;
	const overview = pulse.socialOverview.value;
	const out: KPI[] = [];

	if (pulse.hasSocial.value) {
		out.push({
			key: 'posts',
			label: 'Posts · 30d',
			value: String(m?.socialPostsLast30Days ?? 0),
			sublabel: m?.connectedPlatforms
				? `${m.connectedPlatforms} platform${m.connectedPlatforms === 1 ? '' : 's'}`
				: undefined,
			icon: 'i-heroicons-paper-airplane',
			to: '/social',
		});
		out.push({
			key: 'followers',
			label: 'Followers',
			value: compactNumber(overview?.total_followers),
			sublabel:
				overview && overview.avg_engagement_rate > 0
					? `${(overview.avg_engagement_rate * 100).toFixed(1)}% eng.`
					: undefined,
			icon: 'i-heroicons-users',
			to: '/social/analytics',
		});
	}

	if (pulse.hasEmail.value) {
		out.push({
			key: 'subscribers',
			label: 'Subscribers',
			value: compactNumber(m?.totalSubscribers),
			sublabel: m?.mailingLists
				? `${m.mailingLists} list${m.mailingLists === 1 ? '' : 's'}`
				: undefined,
			icon: 'i-heroicons-envelope',
			to: '/email',
		});
		out.push({
			key: 'campaigns',
			label: 'Campaigns',
			value: String(m?.totalCampaigns ?? 0),
			sublabel: m?.recentCampaigns
				? `${m.recentCampaigns} recent`
				: undefined,
			icon: 'i-heroicons-megaphone',
			to: '/email',
		});
	}

	// Always include contact growth as a 4th tile if we have room
	if (out.length < 4 && m && m.contactGrowth > 0) {
		out.push({
			key: 'growth',
			label: 'New contacts · 30d',
			value: `+${m.contactGrowth}`,
			icon: 'i-heroicons-user-plus',
			to: '/contacts',
			tone: 'positive',
		});
	}

	return out.slice(0, 4);
});

const kpiGridClass = computed(() => {
	switch (kpis.value.length) {
		case 1: return 'grid-cols-1';
		case 2: return 'grid-cols-2';
		case 3: return 'grid-cols-2 sm:grid-cols-3';
		default: return 'grid-cols-2 sm:grid-cols-4';
	}
});
</script>
