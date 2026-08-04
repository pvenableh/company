<script setup lang="ts">
// vuedraggable's component is the DEFAULT export (there is no named
// `VueDraggable` export — that import resolves to undefined and renders nothing).
import VueDraggable from 'vuedraggable';

definePageMeta({ middleware: 'auth' });
useHead({ title: 'Home | Earnest' });

const { user } = useDirectusAuth();
const config = useRuntimeConfig();

// This is the Dashboard surface. The apps shell is applied by the global
// apps-layout middleware (setPageLayout('apps')), so `/` shares the SAME
// persistent layout instance as every /apps/* route — page transitions fire
// when navigating here.

// ── Productivity Engine (existing) ──
const { suggestions, metrics, isAnalyzing, greeting, subtitle, greetingSource, primeGreeting, analyze, loadModule } = useAIProductivityEngine();

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

// Active engine modules = whatever the user has enabled.
const activeEngineModules = computed<Set<string>>(() => new Set(enabledModules.value));

// ── CRM Intelligence Engine ──
// The slim CRM-pulse callout now owns its own useCRMIntelligence() (see
// CommandCenter/CrmPulseCard.vue), so the page no longer wires it here.

// ── Earnest Score ──
const { state: earnestState, syncState, fetchState, fetchTeamRanking, fetchHistory, newBadges, leveledUp, getScoreTier } = useEarnestScore();

// ── Onboarding ──
// For a brand-new org, surface the get-started checklist on the presence
// LANDING (not just below the fold), so a new admin sees how to begin instead
// of a calm-but-empty hero. `shouldShow` self-hides once essentials exist.
const { shouldShow: onboardingShouldShow } = useOnboardingProgress();

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

// ── Priority Actions scope ──
// Mine/All is a LOCAL control on Priority Actions that filters its queue. (The
// old YOU/US/REFERENCE band ordering is gone — the page is now a pinned Priority
// Actions block above a user-customizable widget grid; see useDashboardLayout.)
const { isMine, canChooseAll, setScope } = useDataScope();

// Org-level goals toggle — hides the dashboard's goal widgets when off.
const { goalsEnabled } = useGoalsEnabled();

// ── Weekly check-in streak (Stage 2.5) for the Earnest Score widget ──
// My Goals + org/team goal counts moved into their own widgets
// (CommandCenter/MyGoalsCard.vue, GoalsSummaryWidget); the page keeps only the
// check-in streak the score card needs. Derived from snapshots useGoals loaded.
const { weeklyCheckinStreak } = useGoals();

// ── Weekly check-in modal (Stage 2.5) ──
// Modal lives at the bottom of <template>; trigger pill in YOU's right column
// flips this ref. Lazy v-if keeps the modal tree out of the SSR payload.
const checkinOpen = ref(false);

// Director's Office + Focus mode entries moved to the global chrome (dock +
// top-bar), so the dashboard no longer opens them directly.

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
	invoices: 'money', proposals: 'money',
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

// One honest sentence over the whole feed — "what today is really about." Named
// from the heaviest themes with real numbers, deterministic (no LLM on this hot
// path) so the queue opens with a read, not just a wall of cards.
const feedSynthesis = computed(() => {
	const items = unhandledActions.value.filter(s => s.priority === 'urgent' || s.priority === 'high');
	if (items.length < 3) return '';

	const money = Math.round(metrics.value.pendingInvoiceTotal || 0);
	const projects = items.filter(s => s.category === 'projects' || /project overdue/i.test(s.title)).length;
	const overdueTickets = items
		.filter(s => /overdue tickets? ·/i.test(s.title) || /^overdue:/i.test(s.title))
		.reduce((n, s) => n + (parseInt(s.title, 10) || 1), 0);
	const leads = items.filter(s => s.category === 'leads').length;

	const themes: Array<{ w: number; text: string }> = [];
	if (money >= 1000) themes.push({ w: money / 90, text: `$${money.toLocaleString()} in unpaid invoices` });
	if (projects >= 1) themes.push({ w: 34 + projects * 7, text: `${projects} project${projects > 1 ? 's' : ''} past deadline` });
	if (overdueTickets >= 2) themes.push({ w: 22 + overdueTickets * 2, text: `${overdueTickets} overdue tickets` });
	if (leads >= 2) themes.push({ w: 18 + leads * 3, text: `${leads} leads to chase` });
	if (!themes.length) return '';

	themes.sort((a, b) => b.w - a.w);
	const named = themes.slice(0, 2).map(t => t.text);
	const more = themes.length - 2;
	const tail = more > 0 ? `, and ${more} more thread${more > 1 ? 's' : ''}` : '';
	return `Today's real weight — ${named.join(' and ')}${tail}.`;
});

// ── Presence home — the opt-in calm conversational landing ───────────────────
// Calm first, density on demand: when on, login lands on the presence home and
// the command center sits below the fold (revealed by scroll / the "Everything"
// affordance). Preference is remembered per-user (directus_users.home_mode).
const { isPresence, load: loadHomeMode, setMode: setHomeMode } = useHomeMode();
const commandCenterEl = ref<HTMLElement | null>(null);
const presenceTopAction = computed(() => {
	const a = topActions.value[0];
	return a ? { title: a.title, description: a.description, actionLabel: a.actionLabel } : null;
});

// Learn the user's tendency: if they consistently reach for the command center,
// Earnest pre-reveals it (autoRevealed) — and a "start calm" override lets that
// habit decay. Purely device-local (useHomeTendency / localStorage).
const tendency = useHomeTendency();
const { track } = useProductEvent();
const autoRevealed = ref(false);

function scrollToPresence() {
	document.querySelector('.apps-shell__page')?.scrollTo({ top: 0, behavior: 'smooth' });
}
async function revealCommandCenter(opts: { auto?: boolean } = {}) {
	const el = commandCenterEl.value;
	const page = document.querySelector('.apps-shell__page') as HTMLElement | null;
	if (!el || !page) return;
	// Marker's absolute offset within the scroll container (its final position is
	// stable — set by the fixed-height hero above it — so this is safe to read
	// once the wait below clears). We scroll `.apps-shell__page` directly rather
	// than via scrollIntoView: this is the app's scroller (see scrollToPresence),
	// and scrollTo is the reliable smooth path for a nested custom container.
	const target = () => el.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop;
	if (opts.auto) {
		// Auto-reveal fires on cold mount while the priority queue is still loading;
		// until the command center has laid out its height the container has nowhere
		// to scroll the marker to, and the reveal silently no-ops. Poll (frame-
		// bounded) until the marker is genuinely reachable — the loop exits the
		// instant it is, so the common case (~1–2s: loadHomeMode + the ~12-read
		// runAnalysis) is fast; the ~3s cap is just a best-effort backstop.
		for (let i = 0; i < 180 && page.scrollHeight - page.clientHeight < target() - 8; i++) {
			await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
		}
	} else {
		tendency.recordReveal(); // a genuine reach counts toward the habit
		track('home.reveal', { source: 'presence-home' }); // reached for density
	}
	page.scrollTo({ top: target(), behavior: 'smooth' });
}
function onPresenceStartCalm() {
	autoRevealed.value = false;
	tendency.startCalm(); // vote against auto-reveal so the habit decays
	scrollToPresence();
}
function onPresenceOpenTop() {
	const a = topActions.value[0];
	if (a?.actionRoute) navigateTo(a.actionRoute);
	else revealCommandCenter();
}

onMounted(async () => {
	// Paint the deterministic greeting immediately — before loadHomeMode / the
	// analysis fetches — so the hero never flashes an empty heading on login.
	primeGreeting();
	await loadHomeMode();
	if (!isPresence.value) return;
	if (tendency.prefersDensity()) {
		// They keep opening the command center — open it for them, and count it.
		autoRevealed.value = true;
		tendency.recordReveal();
		await nextTick();
		revealCommandCenter({ auto: true });
	} else {
		tendency.noteVisit(); // a calm visit; decays a stale density habit
	}
});

// Several app categories come from deferred analyzers (CardDesk, deals, channels)
// that only run when their dashboard widget scrolls into view. Selecting an app
// pill loads that app's modules on demand so the filter is populated even if the
// user hasn't scrolled to those widgets. loadModule is cached + idempotent.
const APP_MODULES: Record<ActionApp, string[]> = {
	people: ['carddesk', 'deals', 'phone'],
	work: ['tickets', 'projects', 'tasks', 'scheduling', 'goals', 'channels', 'comments'],
	money: ['invoices', 'deals', 'proposals'],
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

// ── Command-center layout (per-user show/hide + drag-reorder) ──
// Governs everything BELOW the pinned Priority Actions block.
const layout = useDashboardLayout();
const { editing: dashEditing, hiddenList, spanOf, labelOf, scrollOf, hideWidget, showWidget, moveBy } = layout;
const toggleDashEditing = () => layout.toggleEditing();
const resetDash = () => layout.reset();
// Deterministic guards: a "visible" widget still renders nothing when its own
// precondition is false (goals off, no team), which would leave an empty grid
// cell — so filter those out of what the grid receives. setVisibleOrder keeps
// the positions of ids not in this subset, so filtering never drops them from
// the saved order.
const shouldRenderWidget = (id: string) => {
	if (id === 'my-goals' || id === 'goals-summary') return goalsEnabled.value;
	if (id === 'leaderboard') return showLeaderboard.value;
	return true;
};
const renderIds = computed(() => layout.visibleOrdered.value.filter(shouldRenderWidget));
// vuedraggable mutates its :list in place; mirror the canonical order locally
// and commit back on drag end.
const dragList = ref<{ id: string }[]>([]);
watch(renderIds, (ids) => { dragList.value = ids.map((id) => ({ id })); }, { immediate: true });
const onReorderEnd = () => layout.setVisibleOrder(dragList.value.map((w) => w.id));
// Read the saved layout after mount only (client-only localStorage) so SSR and
// first client render both use defaults — no hydration mismatch.
onMounted(() => layout.load());

const goTo = (route: string) => {
	router.push(route);
};

</script>

<template>
	<div class="min-h-screen t-bg text-foreground">
		<!-- Action Board: shown when user IS logged in -->
		<div v-if="user" class="min-h-screen bg-background">
			<!-- Focus-mode nudge disabled: redundant now that the home page lands
			     with the Earnest presence prompt at the top. -->
			<!-- <EarnestFocusNudge :load="attentionLoad" /> -->
			<!-- Apps Layout per-app header — shows the dashboard accent
			     chip + page title, matching the rest of /apps/*. -->
			<AppHeader title="Dashboard" />

			<!-- Trial AI-token nudge — self-hides unless a no-card trial is ~80%+
			     through its bounded grant. Kept above the fold on both home modes. -->
			<div class="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
				<OrganizationTrialTokenBanner />
			</div>

			<!-- Presence home: the calm conversational landing (opt-in via home_mode).
			     The command center below is "everything," one gesture down. -->
			<div v-if="isPresence" class="min-h-[84vh] flex items-center">
				<!-- Brand-new org: lead with "here's how to start" instead of an
				     empty calm hero. -->
				<div v-if="onboardingShouldShow" class="w-full max-w-2xl mx-auto px-4">
					<OnboardingGettingStartedChecklist />
				</div>
				<HomePresenceHome
					v-else
					class="w-full"
					:greeting="greeting || typedGreeting"
					:subtitle="subtitle"
					:read="feedSynthesis"
					:top-action="presenceTopAction"
					:analyzing="isAnalyzing"
					:greeting-source="greetingSource"
					@open-top="onPresenceOpenTop"
					@reveal="revealCommandCenter"
				/>
			</div>

			<div class="max-w-screen-xl mx-auto px-4 pb-8 sm:px-6 lg:px-8 space-y-6">
				<!-- When presence home is on, a quiet marker back to the calm landing. -->
				<div v-if="isPresence" ref="commandCenterEl" class="flex items-center justify-between gap-3 pt-6">
					<div class="flex items-baseline gap-2 min-w-0">
						<span class="text-sm font-semibold uppercase tracking-wide text-foreground/70">Everything</span>
						<!-- Shown only when Earnest opened this for you (learned tendency). -->
						<button
							v-if="autoRevealed"
							class="text-[11px] text-primary/80 hover:text-primary transition-colors truncate"
							@click="onPresenceStartCalm"
						>Earnest opened this — start calm instead</button>
					</div>
					<button
						class="text-[12px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
						@click="setHomeMode('classic')"
					>Use the classic home</button>
				</div>

				<!-- Greeting + Lens Toggle + Assistant Button (classic home only) -->
				<div v-if="!isPresence" class="flex items-end justify-between gap-3 pt-6 sm:pt-8">
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
						<!-- Opt into the calm conversational home (remembered per-user). -->
						<button
							class="hidden sm:inline-flex items-center h-8 px-3 rounded-full text-[12px] font-medium text-muted-foreground border border-border hover:text-foreground hover:border-primary/40 transition-colors"
							@click="setHomeMode('presence')"
						>
							Try the calm home
						</button>
						<button
							@click="openEarnestPanel()"
							aria-label="Earnest"
							class="flex items-center justify-center size-9 bg-primary text-primary-foreground rounded-full shadow-sm transition-all duration-200 ios-press"
						>
							<EarnestIcon class="w-4 h-4" />
						</button>
					</div>
				</div>

				<!-- ═══ Command Center ═══ -->
				<div class="space-y-6">

				<!-- Getting-started activation checklist for new org admins. Self-hides
				     once the essentials exist (or the admin dismisses it) — see
				     useOnboardingProgress.shouldShow. On the presence landing it's
				     shown in the hero instead (above), so skip it here to avoid a
				     double. -->
				<OnboardingGettingStartedChecklist v-if="!(isPresence && onboardingShouldShow)" />


				<!-- Three-band layout. CSS `order` is reactive to the lens toggle —
				     YOU/US swap; REFERENCE always last. Preserves DOM state across
				     toggles so deferred widgets don't re-mount. -->
				<div class="flex flex-col gap-6">

				<!-- ─── Personal band ───
				     Labels intentionally dropped: the header Mine/All toggle is
				     the single source of truth for "what's this view about." A
				     redundant in-page label only added a second mental model.
				     Order still flips via :style based on the same toggle. -->
				<section class="space-y-4">

                <!-- Weekly check-in nudge — self-hides unless a personal goal is stale. -->
                <GoalsCheckinTriggerPill v-if="goalsEnabled" @open="checkinOpen = true" />

                <!-- ═══ Customizable widget grid — Priority Actions is the first widget now.
                     Users show/hide + drag to reorder; layout persists per device
                     (useDashboardLayout). Everything is customizable. -->
                <div class="flex items-center justify-between gap-2 pt-1">
                    <button
                        type="button"
                        class="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                        @click="toggleDashEditing"
                    >
                        <EIcon :name="dashEditing ? 'i-heroicons-check' : 'i-heroicons-adjustments-horizontal'" class="w-3.5 h-3.5" />
                        {{ dashEditing ? 'Done arranging' : 'Customize' }}
                    </button>
                    <button
                        v-if="dashEditing"
                        type="button"
                        class="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        @click="resetDash"
                    >Reset to default</button>
                </div>

                <VueDraggable
                    :list="dragList"
                    item-key="id"
                    handle=".dash-drag-handle"
                    :disabled="!dashEditing"
                    :animation="180"
                    ghost-class="dash-ghost"
                    class="grid grid-cols-1 lg:grid-cols-3 grid-flow-row-dense gap-6 items-start"
                    @end="onReorderEnd"
                >
                    <template #item="{ element, index }">
                        <CommandCenterWidgetFrame
                            :widget-id="element.id"
                            :label="labelOf(element.id)"
                            :span="spanOf(element.id)"
                            :scroll="scrollOf(element.id)"
                            :editing="dashEditing"
                            :first="index === 0"
                            :last="index === dragList.length - 1"
                            @hide="hideWidget(element.id)"
                            @move-up="moveBy(element.id, -1)"
                            @move-down="moveBy(element.id, 1)"
                        >
						<div v-if="element.id === 'priority-actions'" class="space-y-4">
							<div class="flex items-center gap-2">
								<EIcon name="i-heroicons-bolt" class="w-5 h-5 text-primary" />
								<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">
									Priority Actions
								</h3>
								<button
									@click="runAnalysis"
									:disabled="isAnalyzing"
									aria-label="Refresh priority actions"
									class="flex items-center justify-center size-6 rounded-full text-muted-foreground hover:text-primary hover:bg-muted/60 transition-colors disabled:opacity-50"
								>
									<EIcon
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

							<!-- What today is really about — one honest read over the whole feed. -->
							<p v-if="feedSynthesis" class="text-[13px] leading-snug text-muted-foreground">{{ feedSynthesis }}</p>

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
								<EIcon name="i-heroicons-check-circle" class="w-12 h-12 mx-auto mb-3 text-success" />
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
											<EIcon
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
											<!-- Client follow-up (cold proposal / overdue lead): draft in the
											     user's mail client, or send a branded follow-up from Earnest. -->
											<CommandCenterPriorityActionFollowUp
												v-else-if="action.followUp"
												:follow-up="action.followUp"
												@sent="() => onActionStatusUpdated(action, 'completed')"
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
											<EIcon
												name="i-heroicons-chevron-right"
												class="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-200"
											/>
										</div>
									</div>
								</div>
							</div>
						</div>
                            <CommandCenterQuickTasksWidget v-else-if="element.id === 'quick-tasks'" />
                            <!-- Earnest Score + its 30-day trend, stacked in one column. -->
                            <div v-else-if="element.id === 'earnest-score'" class="space-y-4">
                                <EarnestScoreWidget
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
                                <div class="ios-card rounded-2xl bg-card p-4">
                                    <EarnestTrendChart :history="earnestState.history" />
                                </div>
                                <!-- Badges — folded in with the Earnest Score (gamification lives together). -->
                                <div class="flex items-center gap-2 overflow-x-auto py-1 hide-scrollbar">
                                    <ETooltip
                                        v-for="badge in earnestState.badges"
                                        :key="badge.id"
                                        :text="badge.unlocked ? `${badge.name} — ${badge.description}` : `${badge.name} (Locked) — ${badge.description}`"
                                    >
                                        <div
                                            class="flex items-center gap-1.5 px-2.5 py-1 rounded-full shrink-0 transition-all cursor-default"
                                            :class="badge.unlocked ? badgeColor(badge.id) : 'bg-muted/30 text-muted-foreground/40'"
                                        >
                                            <EIcon :name="badge.icon" class="w-3 h-3" />
                                            <span class="text-[10px] font-medium whitespace-nowrap">{{ badge.name }}</span>
                                        </div>
                                    </ETooltip>
                                </div>
                            </div>
                            <CommandCenterMyGoalsCard v-else-if="element.id === 'my-goals'" />
                            <CommandCenterSuggestionsCarousel
                                v-else-if="element.id === 'suggestions'"
                                :suggestions="otherSuggestions"
                                :total="suggestions.length"
                            />
                            <CommandCenterPinnedWork v-else-if="element.id === 'pinned-work'" />
                            <DeferUntilVisible v-else-if="element.id === 'active-work'" min-height="180px">
                                <CommandCenterActiveWorkTabs />
                            </DeferUntilVisible>
                            <ClientOnly v-else-if="element.id === 'project-briefs'">
                                <CommandCenterProjectDigestsWidget />
                            </ClientOnly>
                            <CommandCenterCrmPulseCard v-else-if="element.id === 'crm-pulse'" />
                            <template v-else-if="element.id === 'marketing'">
                                <CommandCenterMarketingPulseWidget v-if="marketingPulse.hasRichData.value" />
                                <CommandCenterMarketingActionsWidget v-else />
                            </template>
                            <DeferUntilVisible v-else-if="element.id === 'goals-summary'" min-height="120px">
                                <GoalsSummaryWidget />
                            </DeferUntilVisible>
                            <DeferUntilVisible v-else-if="element.id === 'financial'" min-height="320px" @enter="onFinancialEnter">
                                <CommandCenterFinancialQuarter />
                            </DeferUntilVisible>
                            <DeferUntilVisible v-else-if="element.id === 'channels'" min-height="200px" @enter="onChatDeskEnter">
                                <CommandCenterChannelsCard />
                            </DeferUntilVisible>
                            <DeferUntilVisible v-else-if="element.id === 'carddesk'" min-height="200px" @enter="onChatDeskEnter">
                                <CommandCenterCardDeskPipeline />
                            </DeferUntilVisible>
                            <div v-else-if="element.id === 'leaderboard'" class="ios-card p-5">
                                <EarnestTeamLeaderboard />
                            </div>
                        </CommandCenterWidgetFrame>
                    </template>
                </VueDraggable>

                <!-- Hidden widgets — re-add from here (edit mode only). -->
                <div v-if="dashEditing && hiddenList.length" class="ios-card p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Hidden widgets</p>
                    <div class="flex flex-wrap gap-2">
                        <button
                            v-for="id in hiddenList"
                            :key="id"
                            type="button"
                            class="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                            @click="showWidget(id)"
                        >
                            <EIcon name="i-heroicons-plus" class="w-3.5 h-3.5" />
                            {{ labelOf(id) }}
                        </button>
                    </div>
                </div>

                </section>
                </div><!-- /customizable command center -->

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

/* Drag placeholder while reordering dashboard widgets (vuedraggable ghost). */
.dash-ghost {
	opacity: 0.4;
	outline: 2px dashed hsl(var(--primary));
	outline-offset: 2px;
	border-radius: 1rem;
}

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
