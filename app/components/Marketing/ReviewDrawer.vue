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
					:key="idx"
					:touch="touch"
					:sequence-index="idx"
					@update="updateTouch(idx, $event)"
					@regenerate="onRegenerate(idx)"
				/>
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

const localTouches = ref<DraftedTouch[]>([]);
const scheduling = ref(false);

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
	next[idx] = { ...next[idx], ...patch };
	localTouches.value = next;
}

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

function onRegenerate(idx: number) {
	console.info('[review-drawer] regenerate', idx, '— wire generator endpoint next');
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
