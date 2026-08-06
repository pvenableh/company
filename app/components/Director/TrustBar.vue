<!--
	DirectorTrustBar — the ambient promotion of the trust gauge into the app
	shell (Phase 2). A compact tier indicator that rides the top chrome next to
	the "E." launcher on EVERY page, so "how much is Earnest allowed to do on its
	own" is always visible, and "Earnest handled X because you trust it — undo?"
	is one glance away.

	Click it to open a popover with the full <EarnestTrustDial> (drag to grant
	more autonomy; the server still enforces the hard safety floor) plus a short
	"recently handled" list — the executed ai_actions, newest first, with a
	one-click Undo where the executor supports it (update_field today).

	Deliberately thin: the rich, entity-scoped suggestions live in <DirectorLayer>
	on the pages themselves. This is the always-on trust + auto-run awareness.
-->
<script setup lang="ts">
const { tier, current, load } = useAiAutonomy();
const { pendingCount, refresh: refreshPending } = useAiPendingActions();
const { selectedOrg } = useOrganization();
const { openEarnestPanel } = useEarnestPanel();

const organizationId = computed(() => (selectedOrg.value as any)?.id || selectedOrg.value || '');

// Tier colour ladder — mirrors <EarnestTrustDial> so the two never disagree.
const TIER_COLOR = ['#6b7280', '#38bdf8', '#22d3ee', '#4fd89a'] as const;
const tierColor = computed(() => TIER_COLOR[Math.max(0, Math.min(3, tier.value))]);

// ── Popover open/close (lightweight; avoids the reka double-toggle quirk) ──────
const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);
function toggle() {
	open.value = !open.value;
	if (open.value) loadRecent();
}
function onDocClick(e: MouseEvent) {
	if (!open.value) return;
	if (rootEl.value && !rootEl.value.contains(e.target as Node)) open.value = false;
}
function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') open.value = false; }

onMounted(() => {
	load();
	refreshPending();
	document.addEventListener('click', onDocClick);
	document.addEventListener('keydown', onEsc);
});
onBeforeUnmount(() => {
	document.removeEventListener('click', onDocClick);
	document.removeEventListener('keydown', onEsc);
});

// ── Recently handled (executed ai_actions, newest first) ──────────────────────
const recent = ref<any[]>([]);
const recentLoading = ref(false);
const busyIds = ref<Set<string | number>>(new Set());

async function loadRecent() {
	if (!organizationId.value) return;
	recentLoading.value = true;
	try {
		const res = await $fetch<{ actions: any[] }>('/api/ai/actions', {
			query: { organizationId: organizationId.value, status: 'executed', limit: 6 },
		});
		recent.value = res?.actions || [];
	} catch {
		recent.value = [];
	} finally {
		recentLoading.value = false;
	}
}

const ACTION_LABELS: Record<string, string> = {
	create_tasks: 'Created tasks',
	create_ticket: 'Created a ticket',
	add_event: 'Added an event',
	create_project: 'Created a project',
	create_content_plan: 'Created a content plan',
	draft_social_posts: 'Drafted social posts',
	create_campaign: 'Created a campaign',
	update_field: 'Updated a field',
};
function label(a: any) { return ACTION_LABELS[a?.action_type] || a?.title || 'Action'; }

function canUndo(a: any): boolean {
	return a?.action_type === 'update_field'
		&& a?.status === 'executed'
		&& !!a?.result && !a.result.undone
		&& a.result.collection != null && a.result.field != null && a.result.id != null;
}
function isUndone(a: any) { return !!a?.result?.undone; }

async function undo(a: any) {
	if (busyIds.value.has(a.id)) return;
	const prev = a.result;
	a.result = { ...(a.result || {}), undone: true }; // optimistic
	busyIds.value = new Set(busyIds.value).add(a.id);
	try {
		await $fetch(`/api/ai/actions/${a.id}/undo`, { method: 'POST' });
	} catch {
		a.result = prev; // rollback
	} finally {
		const next = new Set(busyIds.value); next.delete(a.id); busyIds.value = next;
	}
}

function timeAgo(ts?: string | null) {
	if (!ts) return '';
	const diff = Date.now() - new Date(ts).getTime();
	const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
	if (m < 1) return 'just now';
	if (m < 60) return `${m}m`;
	if (h < 24) return `${h}h`;
	return `${d}d`;
}

function reviewPending() {
	open.value = false;
	openEarnestPanel('Show me what\'s waiting for my approval.');
}
</script>

<template>
	<div ref="rootEl" class="relative shrink-0">
		<!-- Trigger: a tier gauge that rides the chrome. -->
		<button
			type="button"
			class="trustbar__trigger group ios-press"
			:style="{ '--tier-color': tierColor }"
			:aria-label="`Autonomy: ${current.label}. Open the trust dial.`"
			:title="`Autonomy: ${current.label}`"
			@click.stop="toggle"
		>
			<svg viewBox="0 0 24 24" class="trustbar__ring" aria-hidden="true">
				<circle cx="12" cy="12" r="10" class="trustbar__ring-bg" />
				<circle
					cx="12" cy="12" r="10"
					class="trustbar__ring-fg"
					:stroke-dasharray="`${(tier / 3) * 62.83} 62.83`"
				/>
			</svg>
			<span class="trustbar__num">{{ tier }}</span>
			<!-- The pending-approval count already rides the "E." launcher badge
			     right next to this; it surfaces inside the popover instead of
			     doubling up on the trigger. -->
		</button>

		<!-- Popover -->
		<Transition name="trustbar-pop">
			<div v-if="open" class="trustbar__panel glass" @click.stop>
				<div class="trustbar__panel-head">
					<span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
						How much Earnest runs on its own
					</span>
				</div>

				<EarnestTrustDial />

				<!-- Pending review shortcut -->
				<button
					v-if="pendingCount > 0"
					type="button"
					class="trustbar__pending"
					@click="reviewPending"
				>
					<EIcon name="lucide:inbox" class="w-3.5 h-3.5 shrink-0 text-warning" />
					<span><b>{{ pendingCount }}</b> action{{ pendingCount === 1 ? '' : 's' }} waiting for your approval</span>
					<EIcon name="lucide:arrow-right" class="w-3.5 h-3.5 ml-auto shrink-0" />
				</button>

				<!-- Recently handled -->
				<div class="trustbar__recent">
					<div class="flex items-center gap-1.5 mb-1.5">
						<EarnestIcon class="w-3 h-3 text-primary" />
						<span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recently handled</span>
					</div>
					<div v-if="recentLoading" class="space-y-1.5">
						<div v-for="n in 3" :key="n" class="h-6 rounded-lg bg-muted/50 animate-pulse" />
					</div>
					<p v-else-if="!recent.length" class="text-[11px] text-muted-foreground py-1">
						Nothing yet. As you raise trust, what Earnest handles shows up here.
					</p>
					<ul v-else class="space-y-1">
						<li
							v-for="a in recent"
							:key="a.id"
							class="flex items-center gap-2 text-[11px] py-1"
						>
							<EIcon name="lucide:check" class="w-3 h-3 shrink-0 text-success" />
							<span class="min-w-0 flex-1 truncate" :class="isUndone(a) ? 'line-through text-muted-foreground' : 'text-foreground'">
								{{ label(a) }}
								<span v-if="a.title && label(a) !== a.title" class="text-muted-foreground">— {{ a.title }}</span>
							</span>
							<span class="text-[10px] text-muted-foreground shrink-0">{{ timeAgo(a.date_created) }}</span>
							<button
								v-if="canUndo(a)"
								type="button"
								class="text-[10px] font-medium text-primary hover:underline shrink-0 disabled:opacity-50"
								:disabled="busyIds.has(a.id)"
								@click="undo(a)"
							>Undo</button>
						</li>
					</ul>
				</div>
			</div>
		</Transition>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.trustbar__trigger {
	position: relative;
	display: flex; align-items: center; justify-content: center;
	width: 28px; height: 28px; border-radius: 9999px;
	background: hsl(var(--muted) / 0.35);
	box-shadow: var(--glass-edge-shadow);
	transition: background 0.2s ease;
	--tier-color: #38bdf8;
}
.trustbar__trigger:hover { background: hsl(var(--muted) / 0.6); }

.trustbar__ring { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.trustbar__ring-bg { fill: none; stroke: hsl(var(--muted-foreground) / 0.25); stroke-width: 2.5; }
.trustbar__ring-fg {
	fill: none; stroke: var(--tier-color); stroke-width: 2.5; stroke-linecap: round;
	transition: stroke-dasharray 0.5s cubic-bezier(0.36,0.66,0.04,1), stroke 0.4s ease;
}
.trustbar__num {
	font-size: 11px; font-weight: 700; line-height: 1;
	color: hsl(var(--foreground) / 0.85);
	font-variant-numeric: tabular-nums;
}
.trustbar__panel {
	position: absolute; top: calc(100% + 10px); right: 0; z-index: 60;
	width: 300px; max-width: calc(100vw - 24px);
	padding: 14px; border-radius: 20px;
	border: 1px solid hsl(var(--border) / 0.5);
	background: hsl(var(--popover) / 0.98);
	box-shadow: 0 12px 40px -8px rgba(0,0,0,0.35);
	display: flex; flex-direction: column; gap: 12px;
}
.trustbar__panel-head { text-align: center; }

.trustbar__pending {
	display: flex; align-items: center; gap: 7px; width: 100%;
	padding: 8px 10px; border-radius: 12px;
	background: hsl(var(--warning) / 0.1);
	font-size: 11.5px; color: hsl(var(--foreground));
	transition: background 0.2s ease;
}
.trustbar__pending:hover { background: hsl(var(--warning) / 0.16); }

.trustbar__recent { border-top: 1px solid hsl(var(--border) / 0.5); padding-top: 10px; }

.trustbar-pop-enter-active, .trustbar-pop-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.trustbar-pop-enter-from, .trustbar-pop-leave-to { opacity: 0; transform: translateY(-6px) scale(0.98); }
</style>
