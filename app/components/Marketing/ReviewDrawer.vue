<template>
	<Sheet :open="open" @update:open="onOpenChange">
		<SheetContent
			side="bottom"
			class="flex flex-col p-0 gap-0 sm:!max-w-none rounded-t-3xl border-t overflow-hidden"
			style="height: 88vh; max-height: 88vh;"
		>
			<!-- Header -->
			<header class="px-6 pt-5 pb-4 border-b border-border/60">
				<div class="flex items-start justify-between gap-4 mb-3">
					<div class="min-w-0 flex-1">
						<SheetTitle
							class="text-xl font-semibold text-foreground truncate"
							style="text-transform: none; letter-spacing: -0.01em;"
						>
							{{ headline }}
						</SheetTitle>
						<SheetDescription class="text-xs text-muted-foreground mt-1 inline-flex items-center gap-2 normal-case">
							<Icon name="lucide:check-circle-2" class="w-3.5 h-3.5 text-emerald-500" />
							<span>
								Drafted in {{ formattedDuration }} · {{ formatTokens(draft.tokens_spent) }} tokens
							</span>
						</SheetDescription>
					</div>
				</div>

				<!-- Audience strip -->
				<div
					v-if="draft.audience_summary.size > 0"
					class="flex items-center gap-2 text-xs text-muted-foreground"
				>
					<span class="font-medium text-foreground/80">To:</span>
					<div class="flex -space-x-1.5">
						<span
							v-for="(name, i) in draft.audience_summary.sample_names.slice(0, 3)"
							:key="name"
							class="w-6 h-6 rounded-full bg-muted ring-2 ring-background inline-flex items-center justify-center text-[9px] font-medium text-foreground/70"
							:style="{ zIndex: 3 - i }"
						>
							{{ initials(name) }}
						</span>
					</div>
					<span>
						{{ audienceLabel }}
					</span>
				</div>
			</header>

			<!-- Strategy + Context grounding -->
			<div class="px-6 py-4 bg-muted/20 border-b border-border/40 shrink-0">
				<div class="grid md:grid-cols-2 gap-4">
					<div v-if="draft.phase_strategy">
						<h3 class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
							Strategy
						</h3>
						<p class="text-xs text-foreground/80 leading-relaxed">{{ draft.phase_strategy }}</p>
					</div>
					<div>
						<h3 class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
							<Icon name="lucide:sparkles" class="w-3 h-3 text-primary/70" />
							Drafted from your context
						</h3>
						<div class="flex flex-wrap gap-1.5 mb-2">
							<span
								v-for="fact in draft.facts_used"
								:key="fact.id"
								class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-background border border-border/60"
							>
								<Icon :name="factIcon(fact.kind)" class="w-2.5 h-2.5 text-muted-foreground" />
								{{ fact.label }}
							</span>
						</div>
						<p class="text-[10px] text-muted-foreground leading-relaxed">
							<span class="font-medium text-foreground/70">Voice:</span>
							{{ draft.voice_signals.join(' · ') }}
						</p>
					</div>
				</div>
			</div>

			<!-- Touches list (scrollable) -->
			<div class="flex-1 overflow-y-auto px-6 py-5 space-y-4">
				<MarketingTouchEditor
					v-for="(touch, idx) in localTouches"
					:key="touch.id ?? idx"
					:touch="touch"
					:sequence-index="idx"
					:loading="loadingTouchKeys.get(touch.id ?? idx) === 'regenerating'"
					:restoring="loadingTouchKeys.get(touch.id ?? idx) === 'restoring'"
					:personalizing="loadingTouchKeys.get(touch.id ?? idx) === 'personalizing'"
					:personalization-status="touch.id ? personalizationByTouch.get(touch.id) ?? null : null"
					@update="updateTouch(idx, $event)"
					@regenerate="onRegenerate(idx)"
					@restore="onRestore(idx)"
					@personalize="onPersonalize(idx)"
				/>
			</div>

			<!-- Inline error -->
			<div
				v-if="touchError"
				class="px-6 py-2 border-t border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-800/40 text-xs text-rose-800 dark:text-rose-200 shrink-0"
			>
				{{ touchError }}
			</div>

			<!-- Footer -->
			<footer class="border-t border-border/60 px-6 py-4 flex items-center gap-3 shrink-0 bg-background">
				<button
					type="button"
					class="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50"
					:disabled="scheduling"
					@click="onSchedule"
				>
					<Icon
						:name="scheduling ? 'lucide:loader-circle' : 'lucide:calendar-check'"
						class="w-4 h-4"
						:class="{ 'animate-spin': scheduling }"
					/>
					{{ scheduling ? 'Scheduling…' : 'Schedule all' }}
				</button>
				<button
					type="button"
					class="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2.5 text-xs font-medium hover:bg-muted/60 transition-colors"
				>
					<Icon name="lucide:clock" class="w-3.5 h-3.5" />
					Adjust timing
				</button>
				<div class="ml-auto flex items-center gap-2">
					<span class="text-[10px] text-muted-foreground">
						Drafts auto-save · close to come back later
					</span>
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
						@click="onDiscard"
					>
						Discard
					</button>
				</div>
			</footer>
		</SheetContent>
	</Sheet>
</template>

<script setup lang="ts">
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from '~/components/ui/sheet';
import type { MarketingRecommendation } from '~~/shared/marketing-persistence';
import type { DraftedCampaign, DraftedTouch } from '~/composables/useMarketingDrafts';

const props = defineProps<{
	open: boolean;
	recommendation: MarketingRecommendation | null;
	draft: DraftedCampaign;
	headline: string;
}>();

const emit = defineEmits<{
	(e: 'update:open', value: boolean): void;
	(e: 'schedule', payload: { rec: MarketingRecommendation; touches: DraftedTouch[] }): void;
	(e: 'discard', rec: MarketingRecommendation): void;
}>();

interface PersonalizationStatus {
	state: string;
	total: number;
	pending: number;
	processing: number;
	completed: number;
	failed: number;
	is_done: boolean;
}

const localTouches = ref<DraftedTouch[]>([]);
const scheduling = ref(false);
const touchError = ref<string | null>(null);
// Keyed by touch.id when persisted, else by index — handles the brief moment
// before generate returns persisted IDs.
const loadingTouchKeys = ref<Map<number, 'regenerating' | 'restoring' | 'personalizing'>>(new Map());
const personalizationByTouch = ref<Map<number, PersonalizationStatus>>(new Map());
const pollHandles = new Map<number, ReturnType<typeof setInterval>>();
const POLL_INTERVAL_MS = 2500;

watch(
	() => props.draft,
	(d) => {
		// Clone so editor edits don't mutate the parent's draft.
		localTouches.value = JSON.parse(JSON.stringify(d.touches));
	},
	{ immediate: true, deep: true },
);

function updateTouch(idx: number, patch: Partial<DraftedTouch>) {
	const next = [...localTouches.value];
	next[idx] = { ...next[idx]!, ...patch };
	localTouches.value = next;
}

function setTouchLoading(key: number, state: 'regenerating' | 'restoring' | 'personalizing' | null) {
	const next = new Map(loadingTouchKeys.value);
	if (state === null) next.delete(key);
	else next.set(key, state);
	loadingTouchKeys.value = next;
}

function setPersonalizationStatus(touchId: number, status: PersonalizationStatus) {
	const next = new Map(personalizationByTouch.value);
	next.set(touchId, status);
	personalizationByTouch.value = next;
}

async function fetchPersonalizationStatus(touchId: number): Promise<PersonalizationStatus | null> {
	try {
		const res = await $fetch<PersonalizationStatus>(
			`/api/marketing/touches/${touchId}/personalize-status`,
		);
		setPersonalizationStatus(touchId, res);
		return res;
	} catch {
		return null;
	}
}

function stopPolling(touchId: number) {
	const h = pollHandles.get(touchId);
	if (h) {
		clearInterval(h);
		pollHandles.delete(touchId);
	}
}

function startPolling(touchId: number) {
	stopPolling(touchId);
	const tick = async () => {
		const res = await fetchPersonalizationStatus(touchId);
		if (!res || res.is_done) {
			stopPolling(touchId);
		}
	};
	void tick();
	const h = setInterval(tick, POLL_INTERVAL_MS);
	pollHandles.set(touchId, h);
}

async function onPersonalize(idx: number) {
	const touch = localTouches.value[idx];
	if (!touch?.id) {
		touchError.value = 'Touch is not yet persisted — close and reopen the drawer.';
		return;
	}
	const key = touch.id;
	touchError.value = null;
	setTouchLoading(key, 'personalizing');
	try {
		await $fetch(`/api/marketing/touches/${touch.id}/personalize`, {
			method: 'POST',
			body: {},
		});
		startPolling(key);
	} catch (err: any) {
		touchError.value = err?.data?.message || err?.message || 'Could not start personalization.';
	} finally {
		setTouchLoading(key, null);
	}
}

// Pull initial status for any touches that already have variants when the
// drawer opens (e.g. user re-opened a drafted card mid-personalization).
watch(
	() => props.open,
	async (open) => {
		if (!open) {
			for (const id of pollHandles.keys()) stopPolling(id);
			return;
		}
		const ids = localTouches.value.map((t) => t.id).filter((id): id is number => typeof id === 'number');
		await Promise.all(
			ids.map(async (id) => {
				const status = await fetchPersonalizationStatus(id);
				if (status && !status.is_done && status.total > 0) startPolling(id);
			}),
		);
	},
	{ immediate: true },
);

onBeforeUnmount(() => {
	for (const id of pollHandles.keys()) stopPolling(id);
});

function onOpenChange(v: boolean) {
	emit('update:open', v);
}

function onSchedule() {
	if (!props.recommendation) return;
	scheduling.value = true;
	setTimeout(() => {
		emit('schedule', { rec: props.recommendation!, touches: localTouches.value });
		scheduling.value = false;
		emit('update:open', false);
	}, 700);
}

function onDiscard() {
	if (!props.recommendation) return;
	emit('discard', props.recommendation);
	emit('update:open', false);
}

async function onRegenerate(idx: number) {
	const touch = localTouches.value[idx];
	if (!touch?.id) {
		touchError.value = 'Touch is not yet persisted — try closing and reopening the drawer.';
		return;
	}
	const key = touch.id;
	touchError.value = null;
	setTouchLoading(key, 'regenerating');
	try {
		const res = await $fetch<{ touch: DraftedTouch }>(
			`/api/marketing/touches/${touch.id}/regenerate`,
			{ method: 'POST', body: {} },
		);
		const next = [...localTouches.value];
		next[idx] = res.touch;
		localTouches.value = next;
	} catch (err: any) {
		touchError.value = err?.data?.message || err?.message || 'Could not regenerate touch.';
	} finally {
		setTouchLoading(key, null);
	}
}

async function onRestore(idx: number) {
	const touch = localTouches.value[idx];
	if (!touch?.id) return;
	const key = touch.id;
	touchError.value = null;
	setTouchLoading(key, 'restoring');
	try {
		const res = await $fetch<{ touch: DraftedTouch }>(
			`/api/marketing/touches/${touch.id}/restore`,
			{ method: 'POST' },
		);
		const next = [...localTouches.value];
		next[idx] = res.touch;
		localTouches.value = next;
	} catch (err: any) {
		touchError.value = err?.data?.message || err?.message || 'Could not restore touch.';
	} finally {
		setTouchLoading(key, null);
	}
}

const audienceLabel = computed(() => {
	const sa = props.draft.audience_summary;
	if (sa.size === 0) return '';
	const head = sa.sample_names.slice(0, 3).join(', ');
	const overflow = sa.size - Math.min(3, sa.sample_names.length);
	return overflow > 0 ? `${head} +${overflow} more (${sa.size} total)` : head;
});

const formattedDuration = computed(() => {
	const ms = props.draft.duration_ms;
	if (!ms) return '—';
	const s = Math.round(ms / 100) / 10;
	return `${s}s`;
});

function formatTokens(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
	return String(n);
}

function initials(name: string): string {
	return name
		.split(' ')
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('');
}

function factIcon(kind: string): string {
	switch (kind) {
		case 'project':
			return 'lucide:briefcase';
		case 'win':
			return 'lucide:trophy';
		case 'service':
			return 'lucide:tag';
		case 'testimonial':
			return 'lucide:quote';
		default:
			return 'lucide:sparkles';
	}
}
</script>
