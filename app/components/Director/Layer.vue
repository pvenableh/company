<!--
	DirectorLayer — the ONE unified "Director surface".

	This is the consolidation target for Phase 1 of making Earnest a director
	everywhere. It supersedes three drifting components with a single, consistent
	affordance driven by useDirectorLayer:

	  · AppsEntityEarnestCard  → the focus header + Convene + prompt chips
	  · AIProactiveNotices     → the advisory notices block
	  · (dashboard) execution  → live proposals with a uniform approve/undo,
	                             reusing <AiActivityList> so the HITL + preview
	                             logic is never duplicated.

	Give it no entity props and it reflects the current page (via awareness);
	give it an explicit entity and it pins to that record. The same component is
	reused by Phase 2's persistent ambient mount in the app shell.
-->
<script setup lang="ts">
import { Button } from '~/components/ui/button';

const props = withDefaults(defineProps<{
	/** Explicit scope (singular type, e.g. 'client'). Omit to follow the page. */
	entityType?: string | null;
	entityId?: string | null;
	label?: string | null;
	/** Show the "Earnest is focused on …" header row. */
	heading?: boolean;
	/** Show the entity/scope suggested-prompt chips. */
	showPrompts?: boolean;
	/** Show the "Convene the Boardroom" button in the header. */
	showConvene?: boolean;
	/** Show the "Draft a plan" button (inline multi-step planner). */
	showPlan?: boolean;
	/** Show the live pending-proposal queue (self-hides when empty). */
	showProposals?: boolean;
	variant?: 'inline' | 'ambient';
}>(), {
	heading: false,
	showPrompts: false,
	showConvene: false,
	showPlan: true,
	showProposals: true,
	variant: 'inline',
});

const scope = computed(() => ({
	entityType: props.entityType,
	entityId: props.entityId,
	label: props.label,
}));

const {
	resolved,
	hasEntity,
	noticeType,
	hasNotices,
	actionType,
	entityLabel,
	suggestedPrompts,
	ask,
	convene,
	planThis,
	clearPlan,
	planning,
	planError,
	activePlanId,
	planIntro,
	planStepCount,
} = useDirectorLayer(scope);

// ── Advisory notices (deterministic, no LLM) ──────────────────────────────────
const { visibleNotices, fetchNotices, dismissNotice } = useAINotices();
const { getPriorityBg, getPriorityAccent, getPriorityIconClass } = useStatusStyle();
const router = useRouter();

const noticeExpanded = ref(false);
const MAX_COLLAPSED = 2;
const displayedNotices = computed(() =>
	noticeExpanded.value ? visibleNotices.value : visibleNotices.value.slice(0, MAX_COLLAPSED),
);
const hasMoreNotices = computed(() => visibleNotices.value.length > MAX_COLLAPSED);

watch(
	() => [noticeType.value, resolved.value.entityId, hasNotices.value] as const,
	([type, id, ok]) => {
		if (ok && type && id) {
			noticeExpanded.value = false;
			fetchNotices(type as string, id as string);
		}
	},
	{ immediate: true },
);

function onNoticeAction(n: any) {
	if (n.actionRoute) router.push(n.actionRoute);
}

// The header/prompts card is worth rendering only if it would carry something.
const showFocusCard = computed(() => (props.heading || props.showPrompts) && (hasEntity.value || props.showPrompts));
// The whole surface renders only when it has real content to show.
const showAny = computed(() =>
	showFocusCard.value
	|| visibleNotices.value.length > 0
	|| (props.showProposals && hasEntity.value)
	|| !!activePlanId.value || planning.value || !!planError.value,
);
</script>

<template>
	<section v-if="showAny" class="director-layer space-y-3" :class="variant === 'inline' ? 'mb-4' : ''">
		<!-- Focus header + Convene + prompt chips (supersedes EntityEarnestCard) -->
		<div v-if="showFocusCard" class="ios-card p-4">
			<div v-if="heading" class="flex items-center justify-between gap-3 mb-3 flex-wrap">
				<div class="flex items-center gap-2 min-w-0">
					<EarnestPresenceMark :height="16" class="text-foreground/80 shrink-0" />
					<p class="text-sm font-medium truncate">
						Earnest is focused on
						<span class="text-primary">{{ entityLabel || 'your work' }}</span>
					</p>
				</div>
				<div v-if="showPlan || (showConvene && hasEntity)" class="flex items-center gap-2 shrink-0">
					<Button
						v-if="showPlan"
						size="sm"
						class="shrink-0"
						:disabled="planning"
						@click="planThis"
					>
						<Icon v-if="planning" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
						<Icon v-else name="lucide:list-checks" class="w-4 h-4 mr-1.5" />
						{{ planning ? 'Planning…' : 'Draft a plan' }}
					</Button>
					<Button v-if="showConvene && hasEntity" variant="outline" size="sm" class="shrink-0" @click="convene">
						<DirectorChairIcon class="w-4 h-4 mr-1.5" />
						Convene the Boardroom
					</Button>
				</div>
			</div>
			<div v-if="showPrompts" class="flex flex-wrap gap-2">
				<button
					v-for="(p, i) in suggestedPrompts"
					:key="p"
					type="button"
					class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors ios-press"
					:class="i === 0 && resolved.entityType === 'project'
						? 'border border-primary/40 bg-primary/5 font-medium text-primary hover:bg-primary/10'
						: 'border border-border bg-card text-foreground/80 hover:text-foreground hover:border-primary/40 hover:bg-primary/5'"
					@click="ask(p)"
				>
					<Icon name="lucide:sparkles" class="w-3 h-3" :class="i === 0 && resolved.entityType === 'project' ? '' : 'text-primary/70'" />
					{{ p }}
				</button>
			</div>
		</div>

		<!-- Inline plan result — the Boardroom's one-turn planner without the
		     meeting. Steps are pending ai_actions scoped to this plan; the shared
		     <AiActivityList> renders + approves them with the same HITL flow. -->
		<div v-if="planIntro || activePlanId || planError" class="ios-card p-4 space-y-3">
			<div class="flex items-center gap-2">
				<EarnestIcon class="w-3.5 h-3.5 text-primary" />
				<span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Earnest's plan</span>
				<button
					class="ml-auto text-[11px] text-muted-foreground hover:text-foreground transition-colors"
					@click="clearPlan"
				>Dismiss</button>
			</div>
			<p v-if="planIntro" class="text-sm text-foreground/90 whitespace-pre-wrap break-words">{{ planIntro }}</p>
			<p v-if="planError" class="text-xs text-muted-foreground">{{ planError }}</p>
			<AiActivityList v-if="activePlanId && planStepCount" :plan-id="activePlanId" />
		</div>

		<!-- Advisory notices (supersedes ProactiveNotices) -->
		<div v-if="visibleNotices.length > 0">
			<div class="flex items-center gap-1.5 mb-2">
				<EarnestIcon class="w-3.5 h-3.5 text-primary" />
				<span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
					Earnest Notices
				</span>
				<AiFreeMark class="ml-0.5" />
			</div>
			<div class="space-y-2">
				<div v-for="notice in displayedNotices" :key="notice.id" class="group">
					<AccentCard
						:accent="getPriorityAccent(notice.priority)"
						:class="[getPriorityBg(notice.priority), 'transition-all duration-200']"
					>
						<div class="flex items-start gap-3">
							<div class="flex-shrink-0 mt-0.5">
								<EIcon :name="notice.icon" class="w-4 h-4" :class="getPriorityIconClass(notice.priority)" />
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium text-foreground">{{ notice.title }}</p>
								<p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">{{ notice.description }}</p>
								<button
									v-if="notice.actionLabel"
									class="text-xs font-medium text-primary hover:underline mt-1"
									@click="onNoticeAction(notice)"
								>
									{{ notice.actionLabel }} &rarr;
								</button>
							</div>
							<button
								class="flex-shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-background/60 transition-all"
								title="Dismiss"
								@click.stop="dismissNotice(notice.id)"
							>
								<EIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5 text-muted-foreground" />
							</button>
						</div>
					</AccentCard>
				</div>
			</div>
			<button
				v-if="hasMoreNotices"
				class="mt-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors"
				@click="noticeExpanded = !noticeExpanded"
			>
				{{ noticeExpanded ? 'Show less' : `Show ${visibleNotices.length - MAX_COLLAPSED} more` }}
			</button>
		</div>

		<!-- Live proposals — the executable half. <AiActivityList> owns the HITL
		     approve/reject/undo + rich previews and self-hides when empty, so
		     nothing shows until Earnest actually has a pending proposal here. -->
		<AiActivityList
			v-if="showProposals && hasEntity && actionType"
			:entity-type="actionType"
			:entity-id="resolved.entityId"
			status="pending"
			hide-when-empty
		/>
	</section>
</template>
