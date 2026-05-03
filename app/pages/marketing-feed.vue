<template>
	<LayoutPageContainer>
		<!-- Header -->
		<header class="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
			<div>
				<h1 class="text-2xl font-semibold text-foreground tracking-tight">
					This week's marketing
				</h1>
				<p class="text-sm text-muted-foreground mt-1">
					<template v-if="!loading && recommendations.length > 0">
						{{ recommendations.length }} {{ recommendations.length === 1 ? 'thing' : 'things' }} ready to go.
					</template>
					<template v-else-if="!loading && recommendations.length === 0">
						No recommendations yet — check back as your CRM fills out.
					</template>
					<template v-else>
						Loading recommendations…
					</template>
				</p>
			</div>

			<button
				v-if="!loading && recommendations.length > 1 && canDoAll"
				type="button"
				class="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50"
				:disabled="generatingAll"
				@click="onGenerateAll"
			>
				<Icon
					:name="generatingAll ? 'lucide:loader-circle' : 'lucide:sparkles'"
					class="w-4 h-4"
					:class="{ 'animate-spin': generatingAll }"
				/>
				<span>Do all {{ recommendations.length }}</span>
				<span v-if="totalTokenEstimate" class="text-xs opacity-70 font-normal">
					~{{ formatTokens(totalTokenEstimate) }} tokens
				</span>
			</button>
		</header>

		<!-- Error -->
		<div
			v-if="error"
			class="mb-6 rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-800/40 p-4"
		>
			<div class="flex items-start gap-3">
				<Icon name="lucide:circle-alert" class="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
				<div>
					<p class="text-sm font-medium text-rose-900 dark:text-rose-200">{{ error }}</p>
					<button
						type="button"
						class="text-xs text-rose-700 dark:text-rose-300 hover:underline mt-1"
						@click="loadRecommendations"
					>
						Try again
					</button>
				</div>
			</div>
		</div>

		<!-- Loading skeleton -->
		<div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			<div
				v-for="i in 3"
				:key="i"
				class="rounded-2xl border bg-card p-6 animate-pulse"
			>
				<div class="flex items-center gap-2 mb-4">
					<div class="w-9 h-9 rounded-xl bg-muted" />
					<div class="h-3 w-24 bg-muted rounded" />
				</div>
				<div class="h-5 w-3/4 bg-muted rounded mb-3" />
				<div class="h-3 w-full bg-muted/60 rounded mb-2" />
				<div class="h-3 w-5/6 bg-muted/60 rounded mb-5" />
				<div class="flex gap-2">
					<div class="h-8 w-24 bg-muted rounded-full" />
					<div class="h-8 w-24 bg-muted rounded-full" />
				</div>
			</div>
		</div>

		<!-- Cards -->
		<div
			v-else-if="recommendations.length > 0"
			class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
		>
			<MarketingRecommendationCard
				v-for="rec in recommendations"
				:key="rec.id"
				:recommendation="rec"
				:generating="generatingIds.has(rec.id)"
				@generate="onGenerate"
				@customize="onCustomize"
				@skip="onSkip"
			/>
		</div>

		<!-- Empty state -->
		<div
			v-else
			class="rounded-2xl border border-dashed border-border bg-muted/20 p-12 text-center"
		>
			<Icon name="lucide:sparkles" class="w-8 h-8 mx-auto mb-3 text-muted-foreground/60" />
			<h3 class="text-base font-medium text-foreground mb-1">
				Nothing to recommend yet
			</h3>
			<p class="text-sm text-muted-foreground max-w-sm mx-auto">
				Earnest reads your CRM to surface marketing actions worth doing this week. As your client list, projects, and leads fill out, this feed comes alive.
			</p>
		</div>

		<!-- Recently sent placeholder (light footer) -->
		<div
			v-if="!loading && recommendations.length > 0"
			class="mt-12 pt-6 border-t border-border/60"
		>
			<div class="flex items-center justify-between mb-1">
				<h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
					Recently sent
				</h3>
				<NuxtLink
					to="/marketing-timeline"
					class="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
				>
					See full timeline
					<Icon name="lucide:arrow-right" class="w-3 h-3" />
				</NuxtLink>
			</div>
			<p class="text-xs text-muted-foreground/70">
				Past campaigns and engagement metrics will appear here as you ship.
			</p>
		</div>

		<!-- Review drawer -->
		<MarketingReviewDrawer
			v-if="activeRec && activeDraft"
			v-model:open="drawerOpen"
			:recommendation="activeRec"
			:draft="activeDraft"
			:headline="activeHeadline"
			@schedule="onScheduleAll"
			@discard="onDiscardDraft"
		/>

		<!-- Transient toast (schedule/skip outcomes) -->
		<Transition
			enter-active-class="transition duration-150 ease-out"
			enter-from-class="opacity-0 translate-y-2"
			enter-to-class="opacity-100 translate-y-0"
			leave-active-class="transition duration-150 ease-in"
			leave-from-class="opacity-100 translate-y-0"
			leave-to-class="opacity-0 translate-y-2"
		>
			<div
				v-if="toast"
				class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm shadow-lg border"
				:class="
					toast.kind === 'success'
						? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-900/40 dark:border-emerald-700/40 dark:text-emerald-100'
						: 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-900/40 dark:border-rose-700/40 dark:text-rose-100'
				"
			>
				<Icon
					:name="toast.kind === 'success' ? 'lucide:check-circle-2' : 'lucide:circle-alert'"
					class="w-4 h-4"
				/>
				{{ toast.message }}
			</div>
		</Transition>
	</LayoutPageContainer>
</template>

<script setup lang="ts">
import type { MarketingRecommendation } from '~~/shared/marketing-persistence';
import type { DraftedCampaign, DraftedTouch } from '~/composables/useMarketingDrafts';

definePageMeta({
	middleware: ['auth'],
});

useHead({
	title: 'Marketing | Earnest',
});

const { selectedOrg } = useOrganization();
const { isOrgManagerOrAbove } = useOrgRole();
const { generate } = useMarketingDrafts();

/**
 * "Do all N" fires the full campaign sequence in one click — generate +
 * schedule every recommendation back-to-back. That's a real send-out
 * commitment, so we gate it on manager-or-above. Per-card Generate /
 * Customize still works for any active org member (they get to review
 * each draft in the drawer before scheduling).
 */
const canDoAll = computed(() => isOrgManagerOrAbove.value);

const recommendations = ref<MarketingRecommendation[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const generatingIds = ref<Set<number>>(new Set());
const generatingAll = ref(false);

// Drawer state
const drawerOpen = ref(false);
const activeRec = ref<MarketingRecommendation | null>(null);
const activeDraft = ref<DraftedCampaign | null>(null);

// Toast state — single transient message after schedule/skip success.
const toast = ref<{ kind: 'success' | 'error'; message: string } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function flashToast(kind: 'success' | 'error', message: string) {
	toast.value = { kind, message };
	if (toastTimer) clearTimeout(toastTimer);
	toastTimer = setTimeout(() => {
		toast.value = null;
	}, 4000);
}

const activeHeadline = computed(() => {
	if (!activeRec.value) return '';
	return deriveHeadline(activeRec.value);
});

const totalTokenEstimate = computed(() => {
	return recommendations.value.reduce((sum, rec) => {
		const data = (rec.candidate_data || {}) as any;
		const n = Number(data?.token_estimate);
		return sum + (Number.isFinite(n) && n > 0 ? n : 0);
	}, 0);
});

function formatTokens(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
	return String(n);
}

async function loadRecommendations() {
	const orgId = selectedOrg.value;
	if (!orgId) {
		recommendations.value = [];
		return;
	}
	loading.value = true;
	error.value = null;
	try {
		const data = await $fetch<{ recommendations: MarketingRecommendation[] }>(
			'/api/marketing/recommendations',
			{ query: { organizationId: orgId } },
		);
		recommendations.value = data.recommendations || [];
	} catch (err: any) {
		error.value = err?.data?.message || err?.message || 'Failed to load recommendations.';
		recommendations.value = [];
	} finally {
		loading.value = false;
	}
}

async function onGenerate(rec: MarketingRecommendation) {
	generatingIds.value.add(rec.id);
	try {
		const draft = await generate(rec);
		activeRec.value = rec;
		activeDraft.value = draft;
		drawerOpen.value = true;
	} catch (err: any) {
		flashToast('error', err?.data?.message || err?.message || 'Could not generate draft.');
	} finally {
		generatingIds.value.delete(rec.id);
	}
}

function onCustomize(rec: MarketingRecommendation) {
	// For now, customize routes through the same generate flow.
	void onGenerate(rec);
}

async function onSkip(rec: MarketingRecommendation) {
	// Optimistic remove from feed; rollback on error.
	const prior = recommendations.value;
	recommendations.value = prior.filter((r) => r.id !== rec.id);
	try {
		await $fetch(`/api/marketing/recommendations/${rec.id}/skip`, { method: 'POST' });
		flashToast('success', 'Skipped — back to you next week.');
	} catch (err: any) {
		recommendations.value = prior;
		flashToast('error', err?.data?.message || 'Could not skip.');
	}
}

/**
 * Push-button "Do all N": for each recommendation, generate the draft,
 * then immediately schedule it. Runs sequentially so the UI surfaces
 * which one is in flight and the server isn't slammed with parallel
 * Anthropic + Directus writes.
 */
async function onGenerateAll() {
	generatingAll.value = true;
	const targets = [...recommendations.value];
	for (const rec of targets) generatingIds.value.add(rec.id);
	let scheduled = 0;
	for (const rec of targets) {
		try {
			const draft = await generate(rec);
			await $fetch(`/api/marketing/recommendations/${rec.id}/schedule`, {
				method: 'POST',
				body: {
					touches: draft.touches,
					phase_strategy: draft.phase_strategy ?? null,
					cadence_rationale: draft.cadence_rationale ?? null,
					facts_used: draft.facts_used ?? [],
					tokens_spent: draft.tokens_spent ?? 0,
					voice_fingerprint_snapshot: null,
					prompt_versions: { ranker: rec.ranker_prompt_version, generator: 'auto-v1' },
				},
			});
			recommendations.value = recommendations.value.filter((r) => r.id !== rec.id);
			scheduled++;
		} catch (err: any) {
			console.error('[marketing-feed] do-all failed for', rec.id, err);
		} finally {
			generatingIds.value.delete(rec.id);
		}
	}
	generatingAll.value = false;
	if (scheduled === targets.length) {
		flashToast('success', `Scheduled ${scheduled} ${scheduled === 1 ? 'campaign' : 'campaigns'}.`);
	} else if (scheduled > 0) {
		flashToast('error', `Scheduled ${scheduled} of ${targets.length} — some failed.`);
	} else {
		flashToast('error', 'Could not schedule any campaigns.');
	}
}

async function onScheduleAll(payload: { rec: MarketingRecommendation; touches: DraftedTouch[] }) {
	const { rec, touches } = payload;
	const draft = activeDraft.value;

	const body = {
		touches,
		phase_strategy: draft?.phase_strategy ?? null,
		cadence_rationale: draft?.cadence_rationale ?? null,
		facts_used: draft?.facts_used ?? [],
		tokens_spent: draft?.tokens_spent ?? 0,
		voice_fingerprint_snapshot: null,
		prompt_versions: { ranker: rec.ranker_prompt_version, generator: 'stub-v1' },
	};

	// Optimistic remove from feed; rollback on error.
	const prior = recommendations.value;
	recommendations.value = prior.filter((r) => r.id !== rec.id);

	try {
		const result = await $fetch<{ campaign: { id: number }; touches: { id: number }[] }>(
			`/api/marketing/recommendations/${rec.id}/schedule`,
			{ method: 'POST', body },
		);
		flashToast(
			'success',
			`Scheduled — ${result.touches.length} ${result.touches.length === 1 ? 'touch' : 'touches'} queued.`,
		);
		// Drawer animation has finished by now — safe to unmount drawer content.
		activeRec.value = null;
		activeDraft.value = null;
	} catch (err: any) {
		recommendations.value = prior;
		flashToast('error', err?.data?.message || 'Could not schedule the campaign.');
	}
}

async function onDiscardDraft(rec: MarketingRecommendation) {
	const recId = rec.id;
	activeRec.value = null;
	activeDraft.value = null;
	try {
		await $fetch(`/api/marketing/recommendations/${recId}/discard`, { method: 'POST' });
		// Refresh so the card reverts to "pending" state and a fresh Generate
		// runs the AI again instead of reloading the discarded draft.
		await loadRecommendations();
		flashToast('success', 'Draft discarded.');
	} catch (err: any) {
		flashToast('error', err?.data?.message || 'Could not discard draft.');
	}
}

function deriveHeadline(rec: MarketingRecommendation): string {
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
}

watch(selectedOrg, () => loadRecommendations(), { immediate: true });
</script>
