// composables/useDirectorLayer.ts
//
// useDirectorLayer — the shared brain behind the unified **Director surface**:
// the one place Earnest's advisory presence appears anywhere in the app. It
// does NOT introduce a new engine; it composes three things that already exist
// into a single, consistent contract:
//
//   · useEarnestAwareness  — "what am I looking at right now" (scope + entity +
//                            suggested prompts), a shared singleton that updates
//                            on every navigation.
//   · /api/ai/notices      — deterministic advisory notices for the focused
//                            entity (surfaced via useAINotices for dismissal).
//   · /api/ai/actions      — the HITL ai_actions queue (pending proposals), the
//                            executable half, rendered + resolved by
//                            <AiActivityList> so the approve/reject/undo +
//                            preview logic is never duplicated.
//
// The one subtlety this composable owns: **entity_type is stored PLURAL on
// ai_actions rows** (`clients`, `projects`, `tickets` — see
// server/utils/llm/tool-proposals.ts) while awareness + the notices endpoint
// speak SINGULAR (`client`, `project`). So `noticeType` (singular) and
// `actionType` (plural collection) are surfaced separately, and the Boardroom —
// which also keys off the plural collection — is convened with `actionType`.
//
// This is the plug-in point Phase 2's ambient shell mount reuses verbatim: give
// it no scope and it reflects the current page; give it an explicit entity and
// it pins to that record.

import type { MaybeRefOrGetter } from 'vue';

/** Singular awareness/notice type → plural ai_actions collection name. */
const SINGULAR_TO_COLLECTION: Record<string, string> = {
	client: 'clients',
	project: 'projects',
	lead: 'leads',
	ticket: 'tickets',
	invoice: 'invoices',
	contact: 'contacts',
	proposal: 'proposals',
	contract: 'contracts',
	team: 'teams',
	project_event: 'project_events',
	social_post: 'social_posts',
	video_meeting: 'video_meetings',
	email: 'emails',
};

/** Entity types the notices endpoint actually generates for (else: no notices). */
const NOTICE_TYPES = new Set([
	'client', 'project', 'invoice', 'lead', 'proposal', 'contact', 'ticket', 'team',
]);

/** Awareness scope → the Director planner's agenda subject (for scope-level,
 *  non-entity "Draft a plan"). Scopes with no clean subject plan org-wide. */
const SCOPE_SUBJECT: Record<string, string> = {
	money: 'money',
	work: 'projects',
	people: 'clients',
};

/** Awareness scope → a human label for the compact scope surface. */
const SCOPE_NAME: Record<string, string> = {
	dashboard: 'your business',
	people: 'People',
	work: 'Work',
	money: 'Money',
	marketing: 'Marketing',
	organization: 'the organization',
	goals: 'your goals',
};

export interface DirectorLayerScope {
	entityType?: string | null;
	entityId?: string | null;
	label?: string | null;
}

export function useDirectorLayer(scope?: MaybeRefOrGetter<DirectorLayerScope | undefined>) {
	const awareness = useEarnestAwareness();
	const { openEarnestPanel } = useEarnestPanel();
	const { open: openBoardroom } = useBoardroom();
	const autonomy = useAiAutonomy();
	const { selectedOrg } = useOrganization();
	const organizationId = computed(() => (selectedOrg.value as any)?.id || selectedOrg.value || '');

	// Resolve scope: an explicit prop wins; otherwise fall back to the page's
	// awareness entity (detail pages set this via useEntityPageContext).
	const resolved = computed<Required<DirectorLayerScope>>(() => {
		const s = toValue(scope);
		if (s?.entityType && s?.entityId) {
			return { entityType: s.entityType, entityId: String(s.entityId), label: s.label ?? null };
		}
		if (awareness.hasEntity.value) {
			return {
				entityType: awareness.entityType.value as string,
				entityId: String(awareness.entityId.value),
				label: (awareness.entityLabel.value as string) ?? null,
			};
		}
		return { entityType: null as any, entityId: null as any, label: null };
	});

	const hasEntity = computed(() => !!resolved.value.entityType && !!resolved.value.entityId);

	/** Singular type — matches awareness + the notices endpoint. */
	const noticeType = computed(() => (resolved.value.entityType || null));
	const hasNotices = computed(() => !!noticeType.value && NOTICE_TYPES.has(noticeType.value));

	/** Plural collection name — matches ai_actions.entity_type + the Boardroom. */
	const actionType = computed(() => {
		const t = resolved.value.entityType;
		if (!t) return null;
		return SINGULAR_TO_COLLECTION[t] ?? t;
	});

	/** Suggested prompts, already entity/scope-aware. Project gets a lead
	 *  "draft a timeline" step, mirroring the retired EntityEarnestCard. */
	/** Non-entity scope helpers — drive the compact "plan this area" surface. */
	const scopeSubject = computed(() => (hasEntity.value ? null : (SCOPE_SUBJECT[awareness.scope.value] ?? null)));
	const scopeName = computed(() => SCOPE_NAME[awareness.scope.value] ?? 'your work');

	const suggestedPrompts = computed<string[]>(() => {
		const base = awareness.suggestedPrompts.value ?? [];
		if (resolved.value.entityType === 'project') {
			const timeline = `Draft a timeline for the project "${resolved.value.label || ''}": propose the key events, milestones, and tasks it needs, in a sensible order, and add them to this project. Check with me before anything with a cost or a hard deadline.`;
			return [timeline, ...base];
		}
		return base;
	});

	function ask(prompt: string) {
		// Opens Focus AND auto-sends — the entity context is already set by the
		// page, so the reply is aware of this specific record. Nothing is created
		// without an approval (the HITL ai_actions queue).
		openEarnestPanel(prompt);
	}

	function convene() {
		const r = resolved.value;
		if (r.entityType && r.entityId) {
			openBoardroom({
				mode: 'entity',
				entityType: actionType.value || r.entityType,
				entityId: r.entityId,
				label: r.label || '',
			});
		} else {
			openBoardroom({ mode: 'org' });
		}
	}

	// ── Portable multi-step planning (Phase 3) ────────────────────────────────
	// The Boardroom's one-turn planner, reachable INLINE without convening a
	// meeting. It hits the same /api/ai/director/plan producer, scoped to the
	// current entity (or org-wide), and returns a planId whose steps are pending
	// ai_actions — rendered + approved by <AiActivityList :plan-id>. Nothing runs
	// without the same per-step approval as everywhere else.
	const planning = ref(false);
	const planError = ref<string | null>(null);
	const activePlanId = ref<string | null>(null);
	const planIntro = ref('');
	const planStepCount = ref(0);

	async function planThis() {
		if (planning.value || !organizationId.value) return;
		planning.value = true;
		planError.value = null;
		activePlanId.value = null;
		planIntro.value = '';
		try {
			const body: Record<string, string> = { organizationId: organizationId.value };
			if (hasEntity.value && actionType.value) {
				body.entityType = actionType.value;
				body.entityId = String(resolved.value.entityId);
			} else if (scopeSubject.value) {
				// Non-entity scope → plan that area of the business (money/projects/
				// clients). No subject → the org-wide plan.
				body.subject = scopeSubject.value;
			}
			const res = await $fetch<{ planId: string; intro: string; stepCount: number }>(
				'/api/ai/director/plan',
				{ method: 'POST', body },
			);
			activePlanId.value = res.planId;
			planIntro.value = res.intro || '';
			planStepCount.value = res.stepCount || 0;
			if (!res.stepCount) {
				planError.value = 'Nothing needs a plan here right now — you\'re clear.';
			}
		} catch (e: any) {
			planError.value = e?.data?.message || e?.message || 'Earnest could not draft a plan right now.';
		} finally {
			planning.value = false;
		}
	}

	function clearPlan() {
		activePlanId.value = null;
		planIntro.value = '';
		planError.value = null;
		planStepCount.value = 0;
	}

	return {
		// resolved context
		resolved,
		hasEntity,
		noticeType,
		hasNotices,
		actionType,
		entityLabel: computed(() => resolved.value.label),
		focus: awareness.focus,
		scope: awareness.scope,
		scopeSubject,
		scopeName,
		entityReadable: awareness.entityReadable,
		// prompts + actions
		suggestedPrompts,
		ask,
		convene,
		// inline planning
		planThis,
		clearPlan,
		planning,
		planError,
		activePlanId,
		planIntro,
		planStepCount,
		// trust
		autonomyTier: autonomy.tier,
		autonomyInfo: autonomy.current,
		loadAutonomy: autonomy.load,
	};
}
