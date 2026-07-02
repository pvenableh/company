<!--
  DirectorOffice — the org-wide (or focused) "command center" overlay.

  Earnest convenes a working meeting: it opens the board packet (the ai-notices
  sweep, via /api/ai/director/agenda), the user picks a subject, Earnest drafts a
  numbered PLAN of proposed actions (/api/ai/director/plan), and the user approves
  or skips each step one-by-one. Propose-only — nothing runs without a per-step
  approve. A "minutes" rollup summarizes the meeting, and on close any approved
  changes trigger a refresh so the page behind the overlay isn't stale.

  Mounted once globally (app.vue); opened from anywhere via useDirectorOffice().
-->
<script setup lang="ts">
const { isOpen, scope, close } = useDirectorOffice();
const { selectedOrg } = useOrganization();
const toast = useToast();

type Priority = 'urgent' | 'high' | 'medium' | 'low';
interface AgendaNotice { id: string; title: string; description: string; priority: Priority; entityType?: string; entityId?: string }
interface AgendaGroup { subject: string; label: string; topPriority: Priority; notices: AgendaNotice[]; proposedCount: number }
interface Agenda { mode: 'org' | 'entity'; groups: AgendaGroup[]; totalNotices: number; totalProposed: number }

type StepStatus = 'pending' | 'executing' | 'executed' | 'rejected' | 'failed';
interface Step { id: string; action_type: string; title: string; preview: any; status: StepStatus }

const agenda = ref<Agenda | null>(null);
const loadingAgenda = ref(false);
const agendaError = ref<string | null>(null);

const activeSubject = ref<string | null>(null);
const planning = ref(false);
const planIntro = ref('');
const planId = ref<string | null>(null);
const steps = ref<Step[]>([]);
const finance = ref<any | null>(null); // money-mode snapshot metrics
const opportunity = ref<any | null>(null); // money-mode opportunity intel
const clientRating = ref<any | null>(null); // focused client-review scorecard
const topicInput = ref(''); // free-text "raise a topic" steer for the plan
const mutated = ref(false); // any step executed → refresh page behind on close

const fmtMoney = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
const netClass = (n: number) => (Number(n) >= 0 ? 'text-green-600' : 'text-red-600');
function ratingClass(r: string): string {
  return { A: 'bg-green-500/15 text-green-600', B: 'bg-green-500/10 text-green-600', C: 'bg-amber-500/15 text-amber-600', D: 'bg-red-500/10 text-red-600', F: 'bg-red-500/20 text-red-600' }[r] || 'bg-muted text-muted-foreground';
}

const scopeLabel = computed(() => {
  if (scope.value?.mode === 'entity') return scope.value.label || 'this item';
  return 'the organization';
});

const meetingActive = computed(() =>
  !!activeSubject.value || planning.value || !!planIntro.value || steps.value.length > 0 || !!finance.value || !!clientRating.value,
);

function raiseTopic() {
  if (!topicInput.value.trim() || planning.value) return;
  // Free-text topic: draft against the current subject if one is open, else org-wide.
  draftPlan(activeSubject.value || '');
}

const rollup = computed(() => {
  const done = steps.value.filter((s) => s.status === 'executed').length;
  const skipped = steps.value.filter((s) => s.status === 'rejected').length;
  const failed = steps.value.filter((s) => s.status === 'failed').length;
  const open = steps.value.filter((s) => s.status === 'pending' || s.status === 'executing').length;
  return { done, skipped, failed, open, total: steps.value.length };
});

function priorityClass(p: Priority): string {
  return {
    urgent: 'text-red-600 bg-red-500/10',
    high: 'text-amber-600 bg-amber-500/10',
    medium: 'text-blue-600 bg-blue-500/10',
    low: 'text-muted-foreground bg-muted',
  }[p];
}

async function loadAgenda() {
  if (!selectedOrg.value) return;
  loadingAgenda.value = true;
  agendaError.value = null;
  agenda.value = null;
  activeSubject.value = null;
  steps.value = [];
  planId.value = null;
  planIntro.value = '';
  finance.value = null;
  opportunity.value = null;
  clientRating.value = null;
  try {
    const q: Record<string, string> = { organizationId: selectedOrg.value };
    if (scope.value?.mode === 'entity' && scope.value.entityType && scope.value.entityId) {
      q.entityType = scope.value.entityType;
      q.entityId = scope.value.entityId;
    }
    agenda.value = await $fetch<Agenda>('/api/ai/director/agenda', { query: q });
    // Focused meetings have a single subject — open its plan straight away.
    if (agenda.value?.mode === 'entity' && agenda.value.groups.length === 1) {
      draftPlan(agenda.value.groups[0]!.subject);
    }
  } catch (err: any) {
    agendaError.value = err?.data?.message || 'Could not load the agenda.';
  } finally {
    loadingAgenda.value = false;
  }
}

async function draftPlan(subject: string) {
  if (planning.value) return;
  activeSubject.value = subject;
  planning.value = true;
  steps.value = [];
  planId.value = null;
  planIntro.value = '';
  finance.value = null;
  opportunity.value = null;
  clientRating.value = null;
  try {
    const body: Record<string, any> = { organizationId: selectedOrg.value, subject };
    if (topicInput.value.trim()) body.topic = topicInput.value.trim();
    if (scope.value?.mode === 'entity' && scope.value.entityType && scope.value.entityId) {
      body.entityType = scope.value.entityType;
      body.entityId = scope.value.entityId;
    }
    const res = await $fetch<{ planId: string; intro: string; stepCount: number; finance?: any; opportunity?: any; clientRating?: any }>(
      '/api/ai/director/plan', { method: 'POST', body },
    );
    planId.value = res.planId;
    planIntro.value = res.intro || '';
    finance.value = res.finance || null;
    opportunity.value = res.opportunity || null;
    clientRating.value = res.clientRating || null;
    if (res.stepCount > 0) await loadSteps(res.planId);
    else toast.add({ title: 'Nothing to propose', description: 'Earnest had no concrete actions for this area right now.', icon: 'i-lucide-info', color: 'blue' });
  } catch (err: any) {
    toast.add({ title: 'Could not draft a plan', description: err?.data?.message || 'Please try again.', icon: 'i-lucide-alert-circle', color: 'red' });
  } finally {
    planning.value = false;
  }
}

async function loadSteps(pid: string) {
  const res = await $fetch<{ actions: any[] }>('/api/ai/actions', {
    query: { organizationId: selectedOrg.value, planId: pid },
  });
  steps.value = (res.actions || []).map((a: any) => ({
    id: String(a.id),
    action_type: a.action_type,
    title: a.title || a.action_type,
    preview: a.preview || null,
    status: (a.status === 'executed' ? 'executed' : a.status === 'rejected' ? 'rejected' : a.status === 'failed' ? 'failed' : 'pending') as StepStatus,
  }));
}

async function approveStep(step: Step) {
  if (step.status !== 'pending') return;
  step.status = 'executing';
  try {
    await $fetch(`/api/ai/actions/${step.id}/approve`, { method: 'POST' });
    step.status = 'executed';
    mutated.value = true;
  } catch (err: any) {
    step.status = 'failed';
    toast.add({ title: 'Step failed', description: err?.data?.message || 'Could not run this step.', icon: 'i-lucide-alert-circle', color: 'red' });
  }
}

async function skipStep(step: Step) {
  if (step.status !== 'pending') return;
  const prev = step.status;
  step.status = 'rejected';
  try {
    await $fetch(`/api/ai/actions/${step.id}/reject`, { method: 'POST' });
  } catch (err: any) {
    step.status = prev;
    toast.add({ title: 'Could not skip', description: err?.data?.message || 'Please try again.', icon: 'i-lucide-alert-circle', color: 'red' });
  }
}

function labelForType(t: string): string {
  return { create_tasks: 'Tasks', update_field: 'Update', send_email: 'Email', reschedule_project: 'Reschedule' }[t] || t;
}

function onClose() {
  // Only refetch the page behind us if the meeting actually changed data.
  if (mutated.value) refreshNuxtData();
  mutated.value = false;
  close();
}

// Load the agenda each time the office opens (fresh board packet).
watch(isOpen, (open) => { if (open) loadAgenda(); });
onKeyStroke('Escape', () => { if (isOpen.value) onClose(); });
</script>

<template>
  <Teleport to="body">
    <Transition name="director-fade">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4 sm:p-8"
        @click.self="onClose"
      >
        <section class="director-office w-full max-w-3xl my-auto rounded-3xl border border-border bg-card shadow-2xl overflow-hidden">
          <!-- Boardroom header -->
          <header class="flex items-start justify-between gap-3 px-6 py-4 border-b border-border bg-muted/30">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <EarnestIcon class="w-5 h-5 text-primary" />
              </div>
              <div class="min-w-0">
                <h2 class="text-base font-semibold leading-tight">The Director's Office</h2>
                <p class="text-xs text-muted-foreground truncate">
                  Reviewing {{ scopeLabel }} — approve each step, nothing runs on its own.
                </p>
              </div>
            </div>
            <button type="button" class="text-muted-foreground hover:text-foreground p-1 shrink-0" aria-label="Close" @click="onClose">
              <UIcon name="i-lucide-x" class="w-5 h-5" />
            </button>
          </header>

          <div class="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
            <!-- Agenda loading / error -->
            <div v-if="loadingAgenda" class="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
              Reviewing the business…
            </div>
            <div v-else-if="agendaError" class="text-sm text-red-600">{{ agendaError }}</div>

            <template v-else-if="agenda">
              <!-- Empty agenda -->
              <div v-if="agenda.groups.length === 0" class="text-center py-8">
                <UIcon name="i-lucide-check-circle" class="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p class="text-sm text-foreground">Nothing pressing on the agenda.</p>
                <p class="text-xs text-muted-foreground">Earnest found no open issues for {{ scopeLabel }} right now.</p>
              </div>

              <!-- Agenda: subject cards -->
              <div v-else>
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Agenda</p>
                <div class="grid gap-2 sm:grid-cols-2">
                  <button
                    v-for="g in agenda.groups"
                    :key="g.subject"
                    type="button"
                    class="text-left rounded-2xl border p-3 transition-colors hover:border-primary/40"
                    :class="activeSubject === g.subject ? 'border-primary/60 bg-primary/5' : 'border-border bg-background'"
                    @click="draftPlan(g.subject)"
                  >
                    <div class="flex items-center justify-between gap-2 mb-1">
                      <span class="text-sm font-medium">{{ g.label }}</span>
                      <span class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-medium" :class="priorityClass(g.topPriority)">
                        {{ g.topPriority }}
                      </span>
                    </div>
                    <p class="text-xs text-muted-foreground">
                      <template v-if="g.subject === 'money'">
                        Financial review — income, expenses &amp; forecast<template v-if="g.notices.length">, {{ g.notices.length }} flag{{ g.notices.length === 1 ? '' : 's' }}</template>
                      </template>
                      <template v-else>
                        {{ g.notices.length }} item{{ g.notices.length === 1 ? '' : 's' }} needing attention
                      </template>
                    </p>
                  </button>
                </div>

                <!-- Raise a topic (free-text steer) -->
                <div class="mt-3 flex items-center gap-2">
                  <input
                    v-model="topicInput"
                    type="text"
                    placeholder="Raise a topic — e.g. “Are we on track to hit Q3 revenue?”"
                    class="flex-1 rounded-full border border-border bg-background px-3.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    @keydown.enter="raiseTopic"
                  />
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-foreground text-background disabled:opacity-50"
                    :disabled="!topicInput.trim() || planning"
                    @click="raiseTopic"
                  >
                    <UIcon name="i-lucide-message-circle" class="w-3.5 h-3.5" />
                    Discuss
                  </button>
                </div>
              </div>

              <!-- Active meeting: plan / analysis for the chosen subject or topic -->
              <div v-if="meetingActive" class="rounded-2xl border border-border bg-background p-4 space-y-3">
                <div class="flex items-center gap-2">
                  <EarnestIcon class="w-4 h-4 text-primary" />
                  <span class="text-sm font-medium">{{ clientRating ? 'Client rating review' : finance ? 'Financial briefing' : 'Proposed plan' }}</span>
                  <span v-if="planning" class="text-xs text-muted-foreground flex items-center gap-1">
                    <UIcon name="i-lucide-loader-2" class="w-3.5 h-3.5 animate-spin" /> {{ (finance || clientRating) ? 'analyzing…' : 'drafting…' }}
                  </span>
                </div>

                <!-- Client review: rating badge + value / effort / health -->
                <div v-if="clientRating" class="rounded-xl border border-border p-3">
                  <div class="flex items-center gap-3 mb-2">
                    <span class="w-9 h-9 rounded-full flex items-center justify-center text-base font-bold" :class="ratingClass(clientRating.rating)">{{ clientRating.rating }}</span>
                    <div class="min-w-0">
                      <p class="text-sm font-medium truncate">{{ clientRating.clientName }}</p>
                      <p class="text-[11px] text-muted-foreground">Earnest's rating for this account</p>
                    </div>
                  </div>
                  <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="rounded-lg bg-muted/40 p-2">
                      <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Value</p>
                      <p class="text-sm font-semibold">{{ fmtMoney(clientRating.value.revenue) }}</p>
                      <p class="text-[10px] text-muted-foreground">{{ clientRating.value.activeProjects }} active proj.</p>
                    </div>
                    <div class="rounded-lg bg-muted/40 p-2">
                      <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Effort</p>
                      <p class="text-sm font-semibold">{{ clientRating.effort.total }}</p>
                      <p class="text-[10px] text-muted-foreground">touch-points</p>
                    </div>
                    <div class="rounded-lg bg-muted/40 p-2">
                      <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Overdue AR</p>
                      <p class="text-sm font-semibold" :class="clientRating.health.overdueAR > 0 ? 'text-red-600' : ''">{{ fmtMoney(clientRating.health.overdueAR) }}</p>
                      <p class="text-[10px] text-muted-foreground">{{ clientRating.health.staleDays != null ? clientRating.health.staleDays + 'd since touch' : 'no activity' }}</p>
                    </div>
                  </div>
                </div>

                <!-- Money mode: metrics strip -->
                <div v-if="finance" class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div class="rounded-xl bg-muted/40 p-2.5">
                    <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Income / mo (avg)</p>
                    <p class="text-sm font-semibold">{{ fmtMoney(finance.trailing.income) }}</p>
                  </div>
                  <div class="rounded-xl bg-muted/40 p-2.5">
                    <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Expenses / mo (avg)</p>
                    <p class="text-sm font-semibold">{{ fmtMoney(finance.trailing.expenses) }}</p>
                  </div>
                  <div class="rounded-xl bg-muted/40 p-2.5">
                    <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Net / mo (avg)</p>
                    <p class="text-sm font-semibold" :class="netClass(finance.trailing.net)">{{ fmtMoney(finance.trailing.net) }}</p>
                  </div>
                  <div class="rounded-xl bg-muted/40 p-2.5">
                    <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Outstanding AR</p>
                    <p class="text-sm font-semibold">{{ fmtMoney(finance.outstanding.total) }}</p>
                    <p v-if="finance.outstanding.overdueTotal > 0" class="text-[10px] text-red-600">{{ fmtMoney(finance.outstanding.overdueTotal) }} overdue</p>
                  </div>
                  <div class="col-span-2 sm:col-span-4 rounded-xl bg-primary/5 border border-primary/20 p-2.5">
                    <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Projected next {{ finance.projection.horizonMonths }} months (run-rate)</p>
                    <p class="text-sm">
                      Income {{ fmtMoney(finance.projection.income) }} · Expenses {{ fmtMoney(finance.projection.expenses) }} ·
                      <span class="font-semibold" :class="netClass(finance.projection.net)">Net {{ fmtMoney(finance.projection.net) }}</span>
                    </p>
                  </div>
                </div>

                <!-- Money mode: opportunity strip (where the best money is) -->
                <div v-if="opportunity && (opportunity.topClients.length || opportunity.pipeline.openCount)" class="rounded-xl border border-border p-2.5 space-y-1.5">
                  <p class="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><UIcon name="i-lucide-trending-up" class="w-3 h-3" /> Where the money is</p>
                  <p v-if="opportunity.topClients.length" class="text-xs">
                    <span class="text-muted-foreground">Top clients:</span>
                    {{ opportunity.topClients.slice(0, 3).map((c: any) => `${c.name} ${fmtMoney(c.revenue)}`).join(' · ') }}
                  </p>
                  <p v-if="opportunity.topServiceLines.length" class="text-xs">
                    <span class="text-muted-foreground">Best lines:</span>
                    {{ opportunity.topServiceLines.slice(0, 3).map((s: any) => `${s.name} ${fmtMoney(s.revenue)}`).join(' · ') }}
                  </p>
                  <p v-if="opportunity.pipeline.openCount" class="text-xs">
                    <span class="text-muted-foreground">Pipeline:</span>
                    {{ opportunity.pipeline.openCount }} open · ~{{ fmtMoney(opportunity.pipeline.weightedValue) }} weighted
                  </p>
                </div>

                <p v-if="planIntro && !planning" class="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{{ planIntro }}</p>

                <!-- Step cards -->
                <div v-if="steps.length" class="space-y-2">
                  <div
                    v-for="(step, i) in steps"
                    :key="step.id"
                    class="rounded-xl border border-border p-3"
                    :class="step.status === 'rejected' ? 'opacity-60' : ''"
                  >
                    <div class="flex items-start gap-2.5">
                      <span
                        class="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
                        :class="step.status === 'executed' ? 'bg-green-500/15 text-green-600' : step.status === 'failed' ? 'bg-red-500/15 text-red-600' : 'bg-primary/10 text-primary'"
                      >
                        <UIcon v-if="step.status === 'executed'" name="i-lucide-check" class="w-3 h-3" />
                        <UIcon v-else-if="step.status === 'failed'" name="i-lucide-x" class="w-3 h-3" />
                        <template v-else>{{ i + 1 }}</template>
                      </span>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-sm font-medium" :class="step.status === 'rejected' ? 'line-through text-muted-foreground' : ''">{{ step.title }}</span>
                          <span class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{{ labelForType(step.action_type) }}</span>
                        </div>

                        <!-- Email preview before approving a send -->
                        <div v-if="step.action_type === 'send_email' && step.preview" class="mt-1.5 text-xs text-muted-foreground space-y-0.5">
                          <p><span class="font-medium text-foreground">To:</span> {{ step.preview.to || 'contact' }}</p>
                          <p><span class="font-medium text-foreground">Subject:</span> {{ step.preview.subject }}</p>
                        </div>

                        <!-- Status line -->
                        <p v-if="step.status === 'executed'" class="mt-1 text-xs text-green-600">Approved · done</p>
                        <p v-else-if="step.status === 'rejected'" class="mt-1 text-xs text-muted-foreground">Skipped</p>
                        <p v-else-if="step.status === 'failed'" class="mt-1 text-xs text-red-600">Failed — try it manually</p>

                        <!-- Actions -->
                        <div v-else class="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            class="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            :disabled="step.status === 'executing'"
                            @click="approveStep(step)"
                          >
                            <UIcon v-if="step.status === 'executing'" name="i-lucide-loader-2" class="w-3.5 h-3.5 animate-spin" />
                            <UIcon v-else name="i-lucide-check" class="w-3.5 h-3.5" />
                            Approve
                          </button>
                          <button
                            type="button"
                            class="text-xs px-3 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
                            :disabled="step.status === 'executing'"
                            @click="skipStep(step)"
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <p v-else-if="!planning" class="text-sm text-muted-foreground">No concrete steps to propose for this area.</p>

                <!-- Minutes rollup -->
                <div v-if="rollup.total && rollup.open === 0" class="pt-2 border-t border-border text-xs text-muted-foreground">
                  Meeting minutes — {{ rollup.done }} done, {{ rollup.skipped }} skipped<span v-if="rollup.failed">, {{ rollup.failed }} failed</span>.
                </div>
              </div>
            </template>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.director-fade-enter-active,
.director-fade-leave-active {
  transition: opacity 240ms ease;
}
.director-fade-enter-from,
.director-fade-leave-to {
  opacity: 0;
}
.director-office {
  will-change: transform, opacity;
}
</style>
