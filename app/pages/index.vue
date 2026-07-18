<script setup lang="ts">
definePageMeta({ middleware: 'auth' });
useHead({ title: 'Home | Earnest' });

const { user } = useDirectusAuth();
const config = useRuntimeConfig();

// This is the Dashboard surface. The apps shell is applied by the global
// apps-layout middleware (setPageLayout('apps')), so `/` shares the SAME
// persistent layout instance as every /apps/* route — page transitions fire
// when navigating here.

// ── Productivity Engine (existing) ──
const { suggestions, metrics, isAnalyzing, greeting, subtitle, analyze, loadModule } = useAIProductivityEngine();

// Typed-in greeting. The heading slot is height-reserved in the template, so
// nothing shifts when this advances. We only animate once per "value change"
// to keep the effect calm — every persona/tab change retypes from blank.
const typedGreeting = ref('');
let typedGreetingTimer: ReturnType<typeof setInterval> | null = null;
function typeGreeting(target: string) {
	if (typedGreetingTimer) clearInterval(typedGreetingTimer);
	typedGreeting.value = '';
	if (!target) return;
	let i = 0;
	typedGreetingTimer = setInterval(() => {
		i += 1;
		typedGreeting.value = target.slice(0, i);
		if (i >= target.length && typedGreetingTimer) {
			clearInterval(typedGreetingTimer);
			typedGreetingTimer = null;
		}
	}, 28);
}
watch(greeting, (next) => {
	if (next && next !== typedGreeting.value) typeGreeting(next);
}, { immediate: true });
onUnmounted(() => {
	if (typedGreetingTimer) clearInterval(typedGreetingTimer);
});
const { enabledModules } = useAIPreferences();
const { selectedPersona } = useAIPersona();

// Active engine modules = whatever the user has enabled.
const activeEngineModules = computed<Set<string>>(() => new Set(enabledModules.value));

// Update greeting when persona changes
watch(selectedPersona, () => {
	if (user.value) runAnalysis();
});

// ── CRM Intelligence Engine ──
// `snapshot` is the algorithmic snapshot that drives the slim CRM-pulse
// callout. `overview` carries any cached AI result so the score reflects
// the deeper number when present. The AI run-button + insights surface
// live on /contacts?view=insights now.
const { snapshot: crmSnapshot, snapshotLoading: crmSnapshotLoading, overview: crmOverview } = useCRMIntelligence();

// ── Earnest Score ──
const { state: earnestState, syncState, fetchState, fetchTeamRanking, fetchHistory, newBadges, leveledUp, getScoreTier } = useEarnestScore();

const badgeColor = (id: string): string => {
	const colors: Record<string, string> = {
		'first-flame': 'bg-warning/10 text-warning ring-1 ring-warning/20',
		'keeper-of-promises': 'bg-success/10 text-success ring-1 ring-success/20',
		'seven-day-resolve': 'bg-blue-500/10 text-blue-600 ring-1 ring-blue-500/20',
		'thirty-day-pillar': 'bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/20',
		'rapid-responder': 'bg-warning/10 text-warning ring-1 ring-warning/20',
		'deep-current': 'bg-info/10 text-info ring-1 ring-info/20',
		'the-preparator': 'bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/20',
		'team-anchor': 'bg-info/10 text-info ring-1 ring-info/20',
		'first-close': 'bg-success/10 text-success ring-1 ring-success/20',
		'pipeline-builder': 'bg-destructive/10 text-destructive ring-1 ring-destructive/20',
		'follow-up-master': 'bg-warning/10 text-warning ring-1 ring-warning/20',
		'quick-closer': 'bg-pink-500/10 text-pink-600 ring-1 ring-pink-500/20',
		'iron-will': 'bg-destructive/10 text-destructive ring-1 ring-destructive/20',
		'century': 'bg-purple-500/10 text-purple-600 ring-1 ring-purple-500/20',
	};
	return colors[id] || 'bg-primary/10 text-primary ring-1 ring-primary/20';
};
const { celebrate } = useConfetti();

// ── Context ──
const { selectedOrg } = useOrganization();
const { selectedTeam } = useTeams();
const { selectedClient } = useClients();
const router = useRouter();

// ── Marketing pulse (drives compact-vs-rich widget swap below) ──
const marketingPulse = useMarketingPulse();
watch(selectedOrg, () => marketingPulse.load(), { immediate: true });

// ── Band ordering ──
// Fixed order: YOU → US → REFERENCE. Mine/All used to reorder these bands, which
// pushed Priority Actions below the fold on 'all' and read as "the widget
// disappeared". Mine/All is now a LOCAL control on Priority Actions (below) that
// filters its queue instead of reshuffling the page.
// See docs/dashboard-filters-localization-poc.md.
const { isMine, canChooseAll, setScope } = useDataScope();
const youOrder = computed(() => 1);
const usOrder = computed(() => 2);

// Org-level goals toggle — hides the dashboard's goal widgets when off.
const { goalsEnabled } = useGoalsEnabled();

// ── My Goals (scope=user) for the YOU band's right column ──
// Shares state with the rest of useGoals consumers (e.g. GoalsSummaryWidget),
// so this doesn't add a separate fetch. weeklyCheckinStreak (Stage 2.5)
// is derived from snapshots already loaded by useGoals.
const { myGoals, goalProgress: goalProgressFn, weeklyCheckinStreak } = useGoals();
const topMyGoals = computed(() =>
	(myGoals.value || [])
		.filter((g: any) => g.status === 'active')
		.slice(0, 3),
);

// ── Org/Team goal counts for the US band's chip strip ──
const { goalsByScope } = useGoals();
const orgTeamGoalCount = computed(() => {
	const byScope = goalsByScope.value || {} as Record<string, any[]>;
	return ((byScope.team || []).length) + ((byScope.organization || []).length);
});

// ── Weekly check-in modal (Stage 2.5) ──
// Modal lives at the bottom of <template>; trigger pill in YOU's right column
// flips this ref. Lazy v-if keeps the modal tree out of the SSR payload.
const checkinOpen = ref(false);

// Director's Office + Focus mode entries moved to the global chrome (dock +
// top-bar), so the dashboard no longer opens them directly.

// ── AI Tray ──
const aiTrayOpen = ref(false);
const aiTrayPrompt = ref('');

const handleTrayClose = () => {
	aiTrayOpen.value = false;
	aiTrayPrompt.value = '';
};

// ── Prioritized Actions ──
// Locally-resolved actions: when the user changes an item's status inline we
// drop the card immediately (optimistic) and reconcile against server truth in
// the background via runAnalysis().
const handledActionIds = ref<Set<string>>(new Set());

// App filter — narrow the priority list to one app. The engine already fetches
// every category (cheap, cached per-module), so the pills filter the
// already-loaded set client-side: switching is instant and never re-runs the
// ~12-read analysis. Default 'all' shows the global top by score.
type ActionApp = 'people' | 'work' | 'money' | 'marketing';
const CATEGORY_TO_APP: Record<string, ActionApp> = {
	tasks: 'work', projects: 'work', scheduling: 'work', goals: 'work', communication: 'work',
	invoices: 'money',
	leads: 'people', carddesk: 'people', phone: 'people',
	social: 'marketing',
};
const actionApps = [
	{ key: 'all', label: 'All' },
	{ key: 'people', label: 'People' },
	{ key: 'work', label: 'Work' },
	{ key: 'money', label: 'Money' },
	{ key: 'marketing', label: 'Marketing' },
] as const;
const actionAppFilter = ref<'all' | ActionApp>('all');

// All urgent/high actions before the app filter — drives the per-pill counts.
const unhandledActions = computed(() =>
	suggestions.value.filter(s => !handledActionIds.value.has(s.id)),
);

// Attention load — how many things are asking for the user at once. Feeds the
// fatigue-aware Focus-mode nudge (a calmer way through when the board is heavy).
const attentionLoad = computed(() =>
	unhandledActions.value.filter(s => s.priority === 'urgent' || s.priority === 'high').length,
);
// Pill counts reflect ALL priorities per app (not just urgent/high) so an app
// with only medium-priority items — e.g. CardDesk follow-ups — still shows a
// count and isn't a dead pill.
const actionAppCounts = computed<Record<ActionApp, number>>(() => {
	const counts = { people: 0, work: 0, money: 0, marketing: 0 } as Record<ActionApp, number>;
	for (const a of unhandledActions.value) {
		const app = CATEGORY_TO_APP[a.category];
		if (app) counts[app] += 1;
	}
	return counts;
});
// On lg+ the priority list sits beside the taller QuickTasks + Earnest Score
// column, so show two extra items to keep the two columns roughly level. Below
// lg the layout stacks single-column, so keep the tighter count.
const isLgScreen = useMediaQuery('(min-width: 1024px)');
const actionLimit = computed(() => (isLgScreen.value ? 8 : 6));
const topActions = computed(() => {
	// "All" keeps the urgent/high focus (the cross-app priority queue). Drilling
	// into a specific app shows ALL of that app's actions by score — so People
	// surfaces medium CardDesk/lead nudges that the urgent-only view hides.
	if (actionAppFilter.value === 'all') {
		return unhandledActions.value
			.filter(s => s.priority === 'urgent' || s.priority === 'high')
			.slice(0, actionLimit.value);
	}
	return unhandledActions.value
		.filter(a => CATEGORY_TO_APP[a.category] === actionAppFilter.value)
		.slice(0, actionLimit.value);
});

// Several app categories come from deferred analyzers (CardDesk, deals, channels)
// that only run when their dashboard widget scrolls into view. Selecting an app
// pill loads that app's modules on demand so the filter is populated even if the
// user hasn't scrolled to those widgets. loadModule is cached + idempotent.
const APP_MODULES: Record<ActionApp, string[]> = {
	people: ['carddesk', 'deals', 'phone'],
	work: ['tickets', 'projects', 'tasks', 'scheduling', 'goals', 'channels'],
	money: ['invoices', 'deals'],
	marketing: ['social'],
};
watch(actionAppFilter, (app) => {
	if (app === 'all') return;
	for (const m of APP_MODULES[app]) loadModule(m);
});

// App tag per card — since "All" ranks purely by score (invoices dominate),
// each card shows which app it belongs to, colour-coded with that app's accent
// from the active palette. Built as a category→tag lookup so the template does
// a cheap key access instead of recomputing per render.
const { accents } = useAppAccent();
const APP_LABELS: Record<ActionApp, string> = {
	people: 'People', work: 'Work', money: 'Money', marketing: 'Marketing',
};
const APP_ACCENT_ID: Record<ActionApp, string> = {
	people: 'clients', work: 'work', money: 'money', marketing: 'marketing',
};
const appTagByCategory = computed(() => {
	const out: Record<string, { label: string; style: Record<string, string> }> = {};
	for (const [cat, app] of Object.entries(CATEGORY_TO_APP)) {
		const acc = accents.value?.[APP_ACCENT_ID[app]];
		if (!acc) continue;
		out[cat] = {
			label: APP_LABELS[app],
			style: {
				backgroundColor: `hsl(${acc.h} ${acc.s}% ${acc.l}% / 0.14)`,
				color: `hsl(${acc.h} ${acc.s}% ${acc.l}%)`,
			},
		};
	}
	return out;
});

function onActionStatusUpdated(action: any, newStatus: string) {
	const closing = ['completed', 'archived', 'paid'].includes((newStatus || '').toLowerCase());
	if (closing) {
		// Item is resolved — drop the card and reconcile against server truth.
		handledActionIds.value = new Set([...handledActionIds.value, action.id]);
		runAnalysis();
	} else if (action.entity) {
		// Still active — keep the card but reflect the new status on its pill.
		action.entity.status = newStatus;
	}
}

const otherSuggestions = computed(() => {
	// Shown as a horizontal snap-scroll carousel, so we surface more than the
	// old 2x2 grid's 4 — the rest scroll into view.
	return suggestions.value.filter(s => s.priority !== 'urgent' && s.priority !== 'high').slice(0, 12);
});

// ── CRM Pulse (drives the slim glass callout — full breakdown lives on
//     /contacts?view=insights) ──
const healthScore = computed(() => crmOverview.value?.healthScore ?? crmSnapshot.value?.healthScore ?? null);
const healthBreakdown = computed(() => crmOverview.value?.healthBreakdown ?? crmSnapshot.value?.breakdown ?? null);
const crmAlerts = computed(() => crmSnapshot.value?.alerts ?? []);
const healthColor = computed(() => {
	const score = healthScore.value;
	if (score === null) return 'text-muted-foreground';
	if (score >= 75) return 'text-success';
	if (score >= 50) return 'text-warning';
	return 'text-destructive';
});

// ── Priority Styles ──
const { getPriorityIconClass: priorityIconColor, getPriorityBadgeClasses: priorityChipClasses } = useStatusStyle();

// ── Analysis Flow ──
// Dedupes overlapping calls from onMounted + the user/org/team/persona
// watchers that all fire during cold mount. Without this, `analyze()` —
// ~12 Directus reads — runs 2-3× before the page settles.
let analysisInflight: Promise<void> | null = null;
const runAnalysis = (): Promise<void> => {
	if (analysisInflight) return analysisInflight;
	analysisInflight = (async () => {
		try {
			await Promise.all([
				analyze(activeEngineModules.value),
				syncState(metrics.value),
			]);
			// Replay enter handlers for any deferred widgets already in view so
			// a hat switch doesn't drop their lazy modules' suggestions/metrics.
			replayLazyLoaders();
			await fetchTeamRanking();
			if (leveledUp.value || (newBadges.value && newBadges.value.length > 0)) {
				celebrate();
			}
		} finally {
			analysisInflight = null;
		}
	})();
	return analysisInflight;
};

// Lazy module loaders for the three deferred widgets. These modules are left
// out of the cold-mount analyze() set so first paint stays cheap; once the
// `<DeferUntilVisible @enter>` fires, we top up suggestions/metrics with the
// modules each widget actually exercises.
//
// `_lazyEntered` remembers which deferred slots have already become visible
// in this session so that a re-run of `analyze()` (which clears
// `_moduleResults`) re-merges those modules' suggestions instead of
// dropping them — DeferUntilVisible's observer stops after first hit, so
// `@enter` never fires twice for the same instance.
const _lazyEntered = reactive({ chatDesk: false, financial: false });
const onChatDeskEnter = () => {
	_lazyEntered.chatDesk = true;
	loadModule('channels');
	loadModule('carddesk');
};
const onFinancialEnter = () => {
	_lazyEntered.financial = true;
	loadModule('invoices');
	loadModule('deals');
};
const replayLazyLoaders = () => {
	if (_lazyEntered.chatDesk) {
		loadModule('channels');
		loadModule('carddesk');
	}
	if (_lazyEntered.financial) {
		loadModule('invoices');
		loadModule('deals');
	}
};

onMounted(async () => {
	if (user.value) {
		// Fetch state and history in parallel, then run analysis
		await Promise.all([fetchState(), fetchHistory(30)]);
		runAnalysis();
	}
});

watch(user, (newUser) => {
	if (newUser) {
		runAnalysis();
	}
});

// `isMine` included so flipping the Priority Actions Mine/All toggle actually
// re-runs analysis (previously the engine's own isMine watcher only cleared the
// cache, so the queue never visibly refreshed).
watch([selectedOrg, selectedClient, selectedTeam, isMine], () => {
	if (user.value) {
		runAnalysis();
	}
});

// Show leaderboard when a team is selected
const showLeaderboard = computed(() => !!selectedTeam.value);

const goTo = (route: string) => {
	router.push(route);
};

</script>

<template>
	<div class="min-h-screen t-bg t-text">
		<!-- Action Board: shown when user IS logged in -->
		<div v-if="user" class="min-h-screen bg-background">
			<!-- Fatigue-aware invite into Focus mode when the board gets heavy. -->
			<EarnestFocusNudge :load="attentionLoad" />
			<!-- Apps Layout per-app header — shows the dashboard accent
			     chip + page title, matching the rest of /apps/*. -->
			<AppHeader title="Dashboard" />
			<div class="max-w-screen-xl mx-auto px-4 pb-8 sm:px-6 lg:px-8 space-y-6">
				<!-- Greeting + Lens Toggle + Assistant Button -->
				<div class="flex items-end justify-between gap-3 pt-6 sm:pt-8">
					<div class="min-w-0">
						<!-- Reserve a single-line slot for the greeting so the
						     dashboard doesn't jump when the AI greeting resolves.
						     Heights match leading-tight × text-[28px] for the
						     heading and the default 1.5 leading × text-[15px]
						     for the subtitle. Greeting types in once it lands. -->
						<h1
							class="text-[28px] font-bold text-foreground tracking-tight leading-tight truncate"
							style="min-height: 34px"
						>{{ typedGreeting }}<span v-if="greeting && typedGreeting.length < greeting.length" class="dashboard-cursor" aria-hidden="true">|</span></h1>
						<p class="text-[15px] text-muted-foreground mt-0.5 truncate" style="min-height: 22px">{{ subtitle }}</p>
					</div>
					<div class="flex items-center gap-2 shrink-0">
						<!-- Mine/All now lives as a local toggle on Priority Actions (below),
						     not the global chrome; band order is fixed. -->
						<!-- Director's Office now lives in the dock, and Focus mode in the
						     top-bar chrome — both reachable from every page, so they're no
						     longer duplicated in this dashboard header. -->
						<button
							@click="aiTrayPrompt = ''; aiTrayOpen = true"
							aria-label="Earnest"
							class="flex items-center justify-center size-9 bg-primary text-primary-foreground rounded-full shadow-sm transition-all duration-200 ios-press"
						>
							<EarnestIcon class="w-4 h-4" />
						</button>
					</div>
				</div>

				<!-- ═══ Command Center ═══ -->
				<div class="space-y-6">

				<!-- Badge Highlights + Score Stat (always above the bands — user identity strip) -->
				<div class="flex items-center gap-2 overflow-x-auto py-1 hide-scrollbar">
					<!-- Badges -->
					<UTooltip
						v-for="badge in earnestState.badges"
						:key="badge.id"
						:text="badge.unlocked ? `${badge.name} — ${badge.description}` : `${badge.name} (Locked) — ${badge.description}`"
					>
						<div
							class="flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0 transition-all cursor-default"
							:class="badge.unlocked
								? badgeColor(badge.id)
								: 'bg-muted/30 text-muted-foreground/40'"
						>
							<UIcon :name="badge.icon" class="w-3.5 h-3.5" />
							<span class="text-[11px] font-medium whitespace-nowrap">{{ badge.name }}</span>
						</div>
					</UTooltip>
				</div>

				<!-- Three-band layout. CSS `order` is reactive to the lens toggle —
				     YOU/US swap; REFERENCE always last. Preserves DOM state across
				     toggles so deferred widgets don't re-mount. -->
				<div class="flex flex-col gap-6">

				<!-- ─── Personal band ───
				     Labels intentionally dropped: the header Mine/All toggle is
				     the single source of truth for "what's this view about." A
				     redundant in-page label only added a second mental model.
				     Order still flips via :style based on the same toggle. -->
				<section :style="{ order: youOrder }" class="space-y-4">

				<!-- Priority Actions + Quick Tasks | Earnest Score + My Goals -->
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<!-- Left Column: Priority Actions + Quick Tasks (2/3 width) -->
					<div class="lg:col-span-2 space-y-6">
						<!-- Priority Actions -->
						<div class="space-y-4">
							<div class="flex items-center gap-2">
								<UIcon name="i-heroicons-bolt" class="w-5 h-5 text-primary" />
								<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">
									Priority Actions
								</h3>
								<button
									@click="runAnalysis"
									:disabled="isAnalyzing"
									aria-label="Refresh priority actions"
									class="flex items-center justify-center size-6 rounded-full text-muted-foreground hover:text-primary hover:bg-muted/60 transition-colors disabled:opacity-50"
								>
									<UIcon
										name="i-heroicons-arrow-path"
										class="w-3.5 h-3.5"
										:class="{ 'animate-spin': isAnalyzing }"
									/>
								</button>

								<!-- Local Mine/All scope — narrows the priority queue to just your
								     work. Admin/owner only (members only ever see their own), which
								     mirrors the old global toggle's access rule. -->
								<div
									v-if="canChooseAll"
									class="ml-auto inline-flex items-center rounded-full border border-border bg-muted/40 p-0.5 text-[11px] font-medium"
									role="group"
									aria-label="Priority actions scope"
								>
									<button
										type="button"
										class="px-2.5 py-0.5 rounded-full transition-colors"
										:class="isMine ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
										@click="setScope('mine')"
									>
										Mine
									</button>
									<button
										type="button"
										class="px-2.5 py-0.5 rounded-full transition-colors"
										:class="!isMine ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
										@click="setScope('all')"
									>
										All
									</button>
								</div>
							</div>

							<!-- App filters — narrow the list to one app. Counts reflect the
							     full urgent/high set so you can see where attention is needed
							     before clicking in. -->
							<div class="flex items-center gap-1.5 overflow-x-auto hide-scrollbar -mx-0.5 px-0.5">
								<button
									v-for="app in actionApps"
									:key="app.key"
									@click="actionAppFilter = app.key"
									class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors"
									:class="actionAppFilter === app.key
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-border bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted dark:bg-muted/40 dark:hover:bg-muted/70'"
								>
									{{ app.label }}
									<span
										v-if="app.key !== 'all' && actionAppCounts[app.key]"
										class="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[9px] font-semibold leading-none tabular-nums"
										:class="actionAppFilter === app.key
											? 'bg-primary-foreground/25 text-primary-foreground'
											: 'bg-primary text-primary-foreground'"
									>{{ actionAppCounts[app.key] }}</span>
								</button>
							</div>

							<!-- Loading State -->
							<div v-if="isAnalyzing && topActions.length === 0" class="space-y-2">
								<div v-for="n in 4" :key="n" class="h-16 bg-muted rounded-xl animate-pulse"></div>
							</div>

							<!-- Empty State -->
							<div v-else-if="topActions.length === 0 && !isAnalyzing" class="ios-card p-8 text-center">
								<UIcon name="i-heroicons-check-circle" class="w-12 h-12 mx-auto mb-3 text-success" />
								<p class="text-sm font-medium text-foreground">You're all caught up!</p>
								<p class="text-xs text-muted-foreground mt-1">No urgent or high-priority items need your attention right now.</p>
							</div>

							<!-- Action Cards -->
							<div v-else class="space-y-3">
								<div
									v-for="action in topActions"
									:key="action.id"
									class="ios-card p-4 hover:shadow-md transition-all duration-200 cursor-pointer group"
									@click="action.actionRoute && goTo(action.actionRoute)"
								>
									<div class="flex items-start gap-3">
										<div
											class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
											:class="priorityChipClasses(action.priority)"
										>
											<UIcon
												:name="action.icon"
												class="w-4 h-4"
												:class="priorityIconColor(action.priority)"
											/>
										</div>
										<div class="flex-1 min-w-0">
											<p class="text-sm font-medium text-foreground truncate">{{ action.title }}</p>
											<p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">{{ action.description }}</p>
										</div>
										<div class="flex-shrink-0 flex items-center gap-2">
											<!-- Inline quick-status: change an item's status (or mark it
											     done) without leaving the dashboard. Only rendered for
											     cards backed by a concrete ticket/project/task record. -->
											<CommandCenterPriorityActionInvoicePaid
												v-if="action.entity && action.entity.collection === 'invoices'"
												:id="action.entity.id"
												:amount="action.entity.amount"
												@paid="() => onActionStatusUpdated(action, 'paid')"
											/>
											<CommandCenterPriorityActionQuickStatus
												v-else-if="action.entity"
												:entity="action.entity"
												@updated="(s) => onActionStatusUpdated(action, s)"
											/>
											<!-- App tag — which app this action lives in, tinted with that
											     app's palette accent. -->
											<span
												v-if="appTagByCategory[action.category]"
												class="hidden sm:inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md whitespace-nowrap"
												:style="appTagByCategory[action.category].style"
											>
												{{ appTagByCategory[action.category].label }}
											</span>
											<span
												class="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
												:class="priorityChipClasses(action.priority)"
											>
												{{ action.priority }}
											</span>
											<!-- Persistent disclosure chevron. Replaces the old "Complete now →"
											     reveal, which reserved layout width even at opacity-0 and so
											     permanently pushed the priority tag off the right edge. -->
											<UIcon
												name="i-heroicons-chevron-right"
												class="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-200"
											/>
										</div>
									</div>
								</div>
							</div>
						</div>

						<!-- Other Suggestions (lower priority) — personal AI nudges, lives in YOU -->
						<div v-if="otherSuggestions.length > 0" class="ios-card p-5">
							<div class="flex items-center justify-between mb-4">
								<div class="flex items-center gap-2">
									<EarnestIcon class="w-5 h-5 text-primary" />
									<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">
										Suggestions
									</h3>
								</div>
								<UiViewLink
									v-if="suggestions.length > 10"
									size="sm"
									@click="aiTrayPrompt = ''; aiTrayOpen = true"
								>
									View all {{ suggestions.length }}
								</UiViewLink>
							</div>

							<!-- Horizontal snap-scroll carousel — each card is a fixed-width
							     snap target; the row scrolls sideways when suggestions
							     overflow. -->
							<div class="flex gap-3 overflow-x-auto snap-x snap-mandatory hide-scrollbar -mx-1 px-1 pb-1 scroll-px-1">
								<div
									v-for="suggestion in otherSuggestions"
									:key="suggestion.id"
									class="snap-start shrink-0 w-[280px] sm:w-[300px]"
								>
									<CommandCenterSuggestionCard :suggestion="suggestion" class="h-full" />
								</div>
							</div>
						</div>

					</div>

					<!-- Right Column: Earnest Score + My Goals (1/3 width). CRM Health
					     relocated to US band so this column is now purely personal. -->
					<div class="space-y-4 flex flex-col">
						<!-- Quick Tasks — lifted up beside Priority Actions; the Earnest Score
						     card drops below (order-last) to de-emphasise gamification. -->
						<CommandCenterQuickTasksWidget />

						<!-- Earnest Score (lifted to top of column since CRM Health left) -->
						<EarnestScoreWidget
							class="order-last"
							:current-score="earnestState.currentScore"
							:level="earnestState.level"
							:level-title="earnestState.levelTitle"
							:total-e-p="earnestState.totalEP"
							:next-level-e-p="earnestState.nextLevelEP"
							:level-progress="earnestState.levelProgress"
							:streak="earnestState.streak"
							:team-rank="earnestState.teamRank"
							:team-size="earnestState.teamSize"
							:dimensions="earnestState.dimensions"
							:weekly-checkin-streak="weeklyCheckinStreak"
						/>

						<!-- 30-day Earnest Score trend sparkline -->
						<div class="ios-card rounded-2xl border border-border bg-card p-4 order-last">
							<EarnestTrendChart :history="earnestState.history" />
						</div>

						<!-- Stage 2.5: weekly check-in trigger pill. Renders only when
						     >=1 of the user's active personal goals is stale (no snapshot
						     in 7 days, created >=7 days ago). Quiet state = no DOM. -->
						<GoalsCheckinTriggerPill v-if="goalsEnabled" @open="checkinOpen = true" />

						<!-- My Goals (scope=user) — small inline mini-widget reusing
						     useGoals state already loaded by GoalsSummaryWidget in US.
						     Hidden when the org has goals turned off. -->
						<div v-if="goalsEnabled" class="ios-card p-5">
							<div class="flex items-center justify-between mb-3">
								<div class="flex items-center gap-2">
									<UIcon name="i-heroicons-flag" class="w-4 h-4 text-warning" />
									<h3 class="text-xs font-semibold uppercase tracking-wide text-foreground/70">My Goals</h3>
								</div>
								<UiViewLink to="/goals?scope=user" size="sm">
									{{ topMyGoals.length > 0 ? 'View all' : 'Set one' }}
								</UiViewLink>
							</div>
							<div v-if="topMyGoals.length === 0" class="py-3 text-center">
								<p class="text-xs text-muted-foreground">No personal goals yet.</p>
								<p class="text-[10px] text-muted-foreground/70 mt-0.5">Set one to track what's yours.</p>
							</div>
							<div v-else class="space-y-3">
								<NuxtLink
									v-for="g in topMyGoals"
									:key="g.id"
									:to="`/goals?id=${g.id}`"
									class="block group"
								>
									<div class="flex items-center justify-between gap-2 mb-1">
										<p class="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">{{ g.title }}</p>
										<span class="text-[10px] font-medium text-muted-foreground tabular-nums">{{ Math.round(goalProgressFn(g)) }}%</span>
									</div>
									<div class="h-1.5 bg-muted/40 rounded-full overflow-hidden">
										<div
											class="h-full rounded-full transition-all duration-500"
											:class="{
												'bg-success': goalProgressFn(g) >= 90,
												'bg-blue-500': goalProgressFn(g) >= 50 && goalProgressFn(g) < 90,
												'bg-warning': goalProgressFn(g) >= 25 && goalProgressFn(g) < 50,
												'bg-destructive': goalProgressFn(g) < 25,
											}"
											:style="{ width: `${Math.max(goalProgressFn(g), 4)}%` }"
										/>
									</div>
								</NuxtLink>
							</div>
						</div>
					</div>
				</div>

				<!-- Team Leaderboard (shown when a team is selected) -->
				<div v-if="showLeaderboard" class="ios-card p-5">
					<EarnestTeamLeaderboard />
				</div>
				</section>

				<!-- ─── Org band ─── See above re: dropped header label. -->
				<section :style="{ order: usOrder }" class="space-y-4">

					<!-- Active client + project carousels — quick access to the
					     most-recently-active rows. Cards open the corresponding
					     slide-over panel. -->
					<ClientOnly>
						<CommandCenterActiveClientCarousel />
					</ClientOnly>
					<ClientOnly>
						<CommandCenterActiveProjectCarousel />
					</ClientOnly>

					<!-- Today's Briefs + CRM Pulse share one row on large screens. -->
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
					<!-- Today's Briefs (org-wide project digests) -->
					<ClientOnly>
						<CommandCenterProjectDigestsWidget />
					</ClientOnly>

					<!-- CRM Pulse — slim glass callout. The full radial + breakdown
					     + insights + growth-opportunities surface lives on the
					     /contacts Insights tab (one destination per noun). This
					     gives quick reference here without dominating the band. -->
					<NuxtLink
						to="/contacts?view=insights"
						class="glass-surface glass-surface--hoverable p-4 flex items-center gap-4 group"
					>
						<!-- Mini radial -->
						<div v-if="healthScore !== null" class="relative w-12 h-12 shrink-0">
							<svg class="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
								<path class="stroke-muted/30" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke-width="3" />
								<path
									:class="healthColor.replace('text-', 'stroke-')"
									d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
									fill="none"
									stroke-width="3"
									stroke-linecap="round"
									:stroke-dasharray="`${healthScore}, 100`"
								/>
							</svg>
							<div class="absolute inset-0 flex items-center justify-center">
								<span :class="healthColor" class="text-sm font-bold tabular-nums">{{ healthScore }}</span>
							</div>
						</div>
						<div v-else-if="crmSnapshotLoading" class="w-12 h-12 shrink-0 rounded-full bg-muted/40 animate-pulse"></div>
						<div v-else class="w-12 h-12 shrink-0 rounded-full bg-muted/30 flex items-center justify-center">
							<UIcon name="i-heroicons-user-group" class="w-5 h-5 text-muted-foreground/60" />
						</div>

						<!-- Headline + first alert -->
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<h3 class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">CRM pulse</h3>
								<span v-if="healthScore !== null" :class="healthColor" class="text-[10px] font-semibold tabular-nums">
									{{ healthScore >= 75 ? 'Strong' : healthScore >= 50 ? 'Steady' : 'Needs attention' }}
								</span>
							</div>
							<p v-if="crmAlerts.length > 0" class="text-xs text-foreground/80 mt-0.5 truncate">
								{{ crmAlerts[0].message }}
							</p>
							<p v-else-if="healthScore === null" class="text-xs text-muted-foreground mt-0.5">
								Add your first client to start tracking pulse.
							</p>
							<p v-else class="text-xs text-muted-foreground mt-0.5">
								{{ healthBreakdown ? `${Object.keys(healthBreakdown).length} dimensions tracked` : 'Open Insights for full breakdown' }}
							</p>
						</div>

						<!-- Open insights affordance — visually mirrors <UiViewLink> (this
						     is a decorative span, not a nested link, since the whole card
						     is already a NuxtLink). -->
						<span class="hidden sm:inline-flex items-center gap-0.5 text-[11px] font-medium uppercase tracking-wide text-primary opacity-70 group-hover:opacity-100 transition-opacity whitespace-nowrap">
							Open insights
							<UIcon name="i-heroicons-chevron-right" class="w-3.5 h-3.5" />
						</span>
					</NuxtLink>
					</div>

				<!-- Marketing & Social Pulse — full width when we have social/email data -->
				<CommandCenterMarketingPulseWidget v-if="marketingPulse.hasRichData.value" />

					<!-- Marketing actions — compact (only when no social/email data) -->
					<CommandCenterMarketingActionsWidget v-if="!marketingPulse.hasRichData.value" />

					<!-- Goals Summary (org-wide snapshot — shows all scopes) -->
					<DeferUntilVisible v-if="goalsEnabled" min-height="120px">
						<GoalsSummaryWidget />
					</DeferUntilVisible>

					<!-- Financial Analysis (full width) — deferred until scrolled near.
					     `invoices` / `deals` are lazy-loaded here when the slot
					     enters view. -->
					<DeferUntilVisible
						min-height="320px"
						@enter="onFinancialEnter"
					>
						<CommandCenterFinancialQuarter />
					</DeferUntilVisible>
				</section>

				<!-- ─── REFERENCE band ─── -->
				<section
					style="order: 3"
					class="space-y-2"
				>
					<details class="group">
						<summary class="flex items-center gap-2 cursor-pointer list-none py-1 select-none">
							<UIcon name="i-heroicons-chevron-right" class="w-3.5 h-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
							<h2 class="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Less-used</h2>
							<div class="flex-1 h-px bg-border/40"></div>
						</summary>
						<div class="pt-4">
							<DeferUntilVisible min-height="500px" @enter="onChatDeskEnter">
								<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
									<div class="self-start">
										<CommandCenterChannelsCard />
									</div>
									<CommandCenterCardDeskPipeline />
								</div>
							</DeferUntilVisible>
						</div>
					</details>
				</section>

				</div><!-- /three-band wrapper -->

				</div><!-- /Command Center -->

	<!-- ═══ Activity Feed (hidden — kept for future use) ═══ -->
				<!--
				<div v-show="false" class="lg:grid lg:grid-cols-[1fr_380px] lg:gap-6 lg:items-start">
					<div class="space-y-6">
						<CommandCenterTimeline />
					</div>
					<div class="hidden lg:block">
						<div class="lg:sticky lg:top-20 lg:self-start space-y-4">
							<CommandCenterTimelineMotivation
								:greeting="greeting"
								:tasks-completed="metrics?.tasksCompletedToday ?? 0"
								:current-score="earnestState.currentScore"
								:streak="earnestState.streak"
							/>
							<CommandCenterTimelineQuickStats :metrics="metrics" />
							<CommandCenterTimelineTrendChart :history="earnestState.history" />
						</div>
					</div>
				</div>
				-->

			</div>

			<!-- AI Tray -->
			<CommandCenterAITray :is-open="aiTrayOpen" :initial-prompt="aiTrayPrompt" @close="handleTrayClose" />

			<!-- Weekly check-in modal (Stage 2.5). Mounted at root so the trigger
			     pill in YOU's right column doesn't have to portal out of its
			     stacking context. -->
			<GoalsWeeklyCheckinModal v-model="checkinOpen" />
		</div>
	</div>
</template>

<style>
@reference "~/assets/css/tailwind.css";
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
.hide-scrollbar::-webkit-scrollbar { display: none; }

/* Blinking caret for the dashboard's typed greeting. The character is part
 * of the line so it inherits the heading's color and weight. */
.dashboard-cursor {
	display: inline-block;
	margin-left: 1px;
	color: hsl(var(--primary));
	animation: dashboard-cursor-blink 1s steps(2, end) infinite;
}
@keyframes dashboard-cursor-blink {
	0%, 50% { opacity: 1; }
	50.01%, 100% { opacity: 0; }
}
.home {
	.building {
		max-width: 350px;

		@media (min-width: theme('screens.sm')) {
			max-width: 575px;
		}

		@media (min-width: theme('screens.md')) {
			max-width: 575px;
		}

		@media (min-width: theme('screens.lg')) {
			max-width: 600px;
		}
	}

	.temp-heading {
		font-size: 12px;
		bottom: 0px;
		@apply uppercase tracking-wide;
		max-width: 400px;

		@media (min-width: theme('screens.md')) {
			max-width: 400px;
		}

		@media (min-width: theme('screens.lg')) {
			max-width: 440px;
		}
	}

	.logo {
		max-width: 400px;
		@apply px-6 mt-8;

		@media (min-width: theme('screens.md')) {
			max-width: 400px;
		}

		@media (min-width: theme('screens.lg')) {
			max-width: 600px;
		}

		path {
			opacity: 0.4;
			animation-name: example;
			animation-duration: 5s;
			animation-timing-function: var(--curve);
			animation-iteration-count: infinite;
		}

		path:nth-of-type(1) { animation-delay: 0.1s; }
		path:nth-of-type(2) { animation-delay: 0.2s; }
		path:nth-of-type(3) { animation-delay: 0.3s; }
		path:nth-of-type(4) { animation-delay: 0.4s; }
		path:nth-of-type(5) { animation-delay: 0.5s; }
		path:nth-of-type(6) { animation-delay: 0.6s; }
		path:nth-of-type(7) { animation-delay: 0.7s; }
		path:nth-of-type(8) { animation-delay: 0.8s; }
		path:nth-of-type(9) { animation-delay: 0.9s; }
		path:nth-of-type(10) { animation-delay: 1s; }
	}

	@keyframes example {
		0% { opacity: 0.4; }
		50% { opacity: 1; }
		100% { opacity: 0.4; }
	}
}
</style>
