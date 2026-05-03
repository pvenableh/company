<template>
	<article
		class="group relative rounded-2xl border bg-card p-6 transition-all hover:shadow-md"
		:class="cardBorderClass"
	>
		<!-- Type badge + urgency dot -->
		<div class="flex items-center gap-2 mb-4">
			<div
				class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
				:class="iconBgClass"
			>
				<Icon :name="cardConfig.icon" class="w-4.5 h-4.5" :class="iconColorClass" />
			</div>
			<span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
				{{ cardConfig.label }}
			</span>
			<span v-if="urgencyDotVisible" class="ml-auto flex items-center gap-1.5">
				<span class="w-1.5 h-1.5 rounded-full" :class="urgencyDotClass" />
				<span class="text-[10px] text-muted-foreground">{{ urgencyLabel }}</span>
			</span>
		</div>

		<!-- Verb headline. Inline style wins over the modern-theme h2 rule which
		     uppercases globally — full-sentence headlines read shouty in caps. -->
		<h2
			class="text-xl font-semibold text-foreground leading-tight mb-2"
			style="text-transform: none; letter-spacing: -0.01em; font-family: inherit;"
		>
			{{ headline }}
		</h2>

		<!-- Why now (ranker rationale) -->
		<p class="text-sm text-muted-foreground leading-relaxed mb-4">
			{{ recommendation.ranker_output.why_now }}
		</p>

		<!-- Concrete grounding: who/what specifically (the brand-context-aware moment) -->
		<div
			v-if="contextHint"
			class="mb-5 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground flex items-start gap-2"
		>
			<Icon name="lucide:sparkles" class="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary/70" />
			<span>{{ contextHint }}</span>
		</div>

		<!-- Deliverables + cost -->
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-5 text-xs">
			<span v-if="deliverables" class="inline-flex items-center gap-1.5 text-foreground/80">
				<Icon name="lucide:arrow-right" class="w-3 h-3 text-muted-foreground" />
				{{ deliverables }}
			</span>
			<span v-if="tokenEstimate" class="inline-flex items-center gap-1.5 text-muted-foreground">
				<Icon name="lucide:zap" class="w-3 h-3" />
				~{{ formatTokens(tokenEstimate) }} tokens
			</span>
		</div>

		<!-- Actions -->
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				class="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-2 text-xs font-medium hover:bg-foreground/90 transition-colors"
				:disabled="generating"
				@click="$emit('generate', recommendation)"
			>
				<Icon
					:name="generating ? 'lucide:loader-circle' : 'lucide:sparkles'"
					class="w-3.5 h-3.5"
					:class="{ 'animate-spin': generating }"
				/>
				{{ generating ? 'Drafting…' : 'Generate' }}
			</button>
			<button
				type="button"
				class="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium hover:bg-muted/60 transition-colors"
				@click="$emit('customize', recommendation)"
			>
				<Icon name="lucide:settings-2" class="w-3.5 h-3.5" />
				Customize
			</button>
			<button
				type="button"
				class="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors ml-auto"
				@click="$emit('skip', recommendation)"
			>
				Skip this week
			</button>
		</div>
	</article>
</template>

<script setup lang="ts">
import type {
	MarketingRecommendation,
	MarketingCardType,
} from '~~/shared/marketing-persistence';

const props = defineProps<{
	recommendation: MarketingRecommendation;
	generating?: boolean;
}>();

defineEmits<{
	(e: 'generate', rec: MarketingRecommendation): void;
	(e: 'customize', rec: MarketingRecommendation): void;
	(e: 'skip', rec: MarketingRecommendation): void;
}>();

interface CardTypeConfig {
	label: string;
	icon: string;
	iconBg: string;
	iconColor: string;
	border: string;
}

const CARD_CONFIGS: Record<MarketingCardType, CardTypeConfig> = {
	dormant_clients: {
		label: 'Re-engage clients',
		icon: 'lucide:clock-arrow-up',
		iconBg: 'bg-amber-100 dark:bg-amber-900/30',
		iconColor: 'text-amber-700 dark:text-amber-400',
		border: 'border-amber-200/40 dark:border-amber-800/30',
	},
	project_complete: {
		label: 'Recent win',
		icon: 'lucide:trophy',
		iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
		iconColor: 'text-emerald-700 dark:text-emerald-400',
		border: 'border-emerald-200/40 dark:border-emerald-800/30',
	},
	lead_reengagement: {
		label: 'Quiet leads',
		icon: 'lucide:zap',
		iconBg: 'bg-blue-100 dark:bg-blue-900/30',
		iconColor: 'text-blue-700 dark:text-blue-400',
		border: 'border-blue-200/40 dark:border-blue-800/30',
	},
	new_client_welcome: {
		label: 'New client',
		icon: 'lucide:hand-heart',
		iconBg: 'bg-pink-100 dark:bg-pink-900/30',
		iconColor: 'text-pink-700 dark:text-pink-400',
		border: 'border-pink-200/40 dark:border-pink-800/30',
	},
	service_promo: {
		label: 'Service spotlight',
		icon: 'lucide:megaphone',
		iconBg: 'bg-purple-100 dark:bg-purple-900/30',
		iconColor: 'text-purple-700 dark:text-purple-400',
		border: 'border-purple-200/40 dark:border-purple-800/30',
	},
	campaign_clone: {
		label: 'Repeat a winner',
		icon: 'lucide:copy',
		iconBg: 'bg-cyan-100 dark:bg-cyan-900/30',
		iconColor: 'text-cyan-700 dark:text-cyan-400',
		border: 'border-cyan-200/40 dark:border-cyan-800/30',
	},
	partner_anniversary: {
		label: 'Partner moment',
		icon: 'lucide:cake',
		iconBg: 'bg-rose-100 dark:bg-rose-900/30',
		iconColor: 'text-rose-700 dark:text-rose-400',
		border: 'border-rose-200/40 dark:border-rose-800/30',
	},
	event_teaser: {
		label: 'Upcoming event',
		icon: 'lucide:calendar-clock',
		iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
		iconColor: 'text-indigo-700 dark:text-indigo-400',
		border: 'border-indigo-200/40 dark:border-indigo-800/30',
	},
};

const cardConfig = computed<CardTypeConfig>(
	() => CARD_CONFIGS[props.recommendation.card_type] || CARD_CONFIGS.dormant_clients,
);

const cardBorderClass = computed(() => cardConfig.value.border);
const iconBgClass = computed(() => cardConfig.value.iconBg);
const iconColorClass = computed(() => cardConfig.value.iconColor);

// ─── Headline derivation ───────────────────────────────────────────────────
// Verb-led headline: action + concrete number, never a noun like "campaign."

const headline = computed(() => {
	const rec = props.recommendation;
	const data = (rec.candidate_data || {}) as any;
	const audienceSize = data?.audience?.size ?? 0;

	switch (rec.card_type) {
		case 'dormant_clients':
			return `Reach out to ${audienceSize} dormant ${audienceSize === 1 ? 'client' : 'clients'}`;
		case 'project_complete': {
			const phase = data?.phase as string | undefined;
			const contact = data?.signal?.primary_contact_name as string | undefined;
			const project = data?.signal?.project_title as string | undefined;
			if (phase === 'request_testimonial' && contact) {
				return `Ask ${contact} for a testimonial`;
			}
			if (project) {
				return `Turn ${project} into a campaign`;
			}
			return 'Surface a recent win';
		}
		case 'lead_reengagement': {
			const topic = data?.cluster?.label as string | undefined;
			const count = data?.cluster?.size ?? audienceSize;
			if (topic) return `Re-engage ${count} ${topic.toLowerCase()} ${count === 1 ? 'lead' : 'leads'}`;
			return `Re-engage ${count} quiet ${count === 1 ? 'lead' : 'leads'}`;
		}
		case 'new_client_welcome':
			return `Welcome ${audienceSize} new ${audienceSize === 1 ? 'client' : 'clients'}`;
		case 'service_promo': {
			const service = data?.signal?.service as string | undefined;
			return service ? `Promote ${service}` : 'Promote a service';
		}
		case 'campaign_clone': {
			const source = data?.signal?.source_campaign as string | undefined;
			return source ? `Clone the ${source} campaign` : 'Clone a winning campaign';
		}
		case 'partner_anniversary': {
			const partner = data?.signal?.partner_name as string | undefined;
			return partner ? `Anniversary touch for ${partner}` : 'Acknowledge a partner';
		}
		case 'event_teaser': {
			const event = data?.signal?.event_name as string | undefined;
			return event ? `Tease ${event}` : 'Build buzz for an upcoming event';
		}
		default:
			return 'Take action';
	}
});

// ─── Context hint ──────────────────────────────────────────────────────────
// Concrete grounding visible on the card before generation runs.
// This is the "only Earnest can offer" — drafted from your real data.

const contextHint = computed<string | null>(() => {
	const rec = props.recommendation;
	const data = (rec.candidate_data || {}) as any;
	const samples: string[] | undefined = data?.audience?.sample_names;
	const audienceSize = data?.audience?.size ?? 0;

	const sampleLabel = (extra?: string) => {
		if (!samples || samples.length === 0) return null;
		const overflow = audienceSize - samples.length;
		const list = samples.slice(0, 3).join(', ');
		const tail = overflow > 0 ? ` +${overflow}` : '';
		return extra ? `${extra} · ${list}${tail}` : `Including ${list}${tail}`;
	};

	switch (rec.card_type) {
		case 'project_complete': {
			const project = data?.signal?.project_title as string | undefined;
			const win = data?.signal?.recent_win as string | undefined;
			if (project && win) return `About: ${project} · ${win}`;
			if (project) return `About: ${project}`;
			return null;
		}
		case 'lead_reengagement': {
			const topic = data?.cluster?.label as string | undefined;
			return sampleLabel(topic ? `Topic: ${topic}` : undefined);
		}
		case 'service_promo': {
			const svc = data?.signal?.service as string | undefined;
			return svc ? `Service: ${svc}` : null;
		}
		default:
			return sampleLabel();
	}
});

// ─── Deliverables + tokens ─────────────────────────────────────────────────

const deliverables = computed<string | null>(() => {
	const data = (props.recommendation.candidate_data || {}) as any;
	return (data?.deliverables as string) || null;
});

const tokenEstimate = computed<number | null>(() => {
	const data = (props.recommendation.candidate_data || {}) as any;
	const n = Number(data?.token_estimate);
	return Number.isFinite(n) && n > 0 ? n : null;
});

function formatTokens(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
	return String(n);
}

// ─── Urgency dot ───────────────────────────────────────────────────────────

const urgencyDotVisible = computed(() => typeof props.recommendation.urgency === 'number');

const urgencyDotClass = computed(() => {
	const u = props.recommendation.urgency ?? 0;
	if (u >= 70) return 'bg-rose-500';
	if (u >= 40) return 'bg-amber-500';
	return 'bg-muted-foreground/40';
});

const urgencyLabel = computed(() => {
	const u = props.recommendation.urgency ?? 0;
	if (u >= 70) return 'Time-sensitive';
	if (u >= 40) return 'This week';
	return 'When ready';
});
</script>
