<script setup lang="ts">
/**
 * AiActivityList — a self-contained feed of Earnest AI actions (the ai_actions
 * audit log). Org-wide by default; pass `entityType` + `entityId` to scope it to
 * a single record (e.g. one proposal/contract).
 *
 * Reads GET /api/ai/actions, which uses the admin client + org-membership auth
 * (client-side Directus perms on ai_actions are intentionally NOT relied upon).
 *
 * Per the Earnest voice charter: rows present plainly what the AI did and link
 * to the real artifacts (drafted proposal/contract) — no editorializing.
 */
import { Button } from '~/components/ui/button';

const props = withDefaults(defineProps<{
  entityType?: string | null;
  entityId?: string | null;
  /** Show the status filter chips (turns the org-wide feed into a review queue). */
  showFilters?: boolean;
}>(), {
  showFilters: false,
});

const toast = useToast();
const { selectedOrg } = useOrganization();
const organizationId = computed(() => (selectedOrg.value as any)?.id || selectedOrg.value || '');
const { refresh: refreshPendingActions } = useAiPendingActions();

const proposalSlide = useAppSlideOver('proposal');
const contractSlide = useAppSlideOver('contract');

const actions = ref<any[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

// ── Status filter (review queue) ──────────────────────────────────────────────
const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'executed', label: 'Done' },
  { key: 'failed', label: 'Failed' },
] as const;
const statusFilter = ref<string>('');

async function load() {
  if (!organizationId.value) { actions.value = []; loading.value = false; return; }
  loading.value = true;
  error.value = null;
  // Reloading replaces the feed — drop any stale selection.
  selectedIds.value = new Set();
  try {
    const res = await $fetch<{ actions: any[] }>('/api/ai/actions', {
      query: {
        organizationId: organizationId.value,
        ...(props.entityType && props.entityId
          ? { entityType: props.entityType, entityId: props.entityId }
          : {}),
        ...(statusFilter.value ? { status: statusFilter.value } : {}),
      },
    });
    actions.value = res?.actions || [];
    // Keep the shared pending badge in sync with the feed.
    refreshPendingActions();
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Failed to load activity';
    actions.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(organizationId, load);
watch(() => [props.entityType, props.entityId], load);
watch(statusFilter, load);

// ── Approve / reject (optimistic, with rollback per iOS reactive-CRUD policy) ──
const busyIds = ref<Set<string | number>>(new Set());
function isBusy(id: string | number) { return busyIds.value.has(id); }

async function resolveAction(a: any, decision: 'approve' | 'reject') {
  if (isBusy(a.id)) return;
  const prevStatus = a.status;
  const prevResult = a.result;
  // Optimistic: approve → Done, reject → Rejected.
  a.status = decision === 'approve' ? 'executed' : 'rejected';
  busyIds.value = new Set(busyIds.value).add(a.id);
  try {
    const res = await $fetch<{ status: string; result?: any }>(`/api/ai/actions/${a.id}/${decision}`, {
      method: 'POST',
    });
    a.status = res?.status || a.status;
    if (res?.result) a.result = res.result;
    a.error = null;
    toast.add({
      title: decision === 'approve' ? 'Action approved' : 'Action rejected',
      color: 'green',
    });
    // A pending row just left the queue — update the shared badge.
    refreshPendingActions();
  } catch (err: any) {
    // Rollback.
    a.status = prevStatus;
    a.result = prevResult;
    toast.add({
      title: decision === 'approve' ? 'Could not approve action' : 'Could not reject action',
      description: err?.data?.message || err?.message,
      color: 'red',
    });
  } finally {
    const next = new Set(busyIds.value);
    next.delete(a.id);
    busyIds.value = next;
  }
}

// ── Bulk selection (review queue only) ─────────────────────────────────────────
// Multi-select + a sticky bulk bar so a growing auto-filled queue (cron + chat)
// can be cleared without one-at-a-time clicking. Only meaningful in the org-wide
// review queue — not on an entity-scoped timeline.
const canSelect = computed(() => props.showFilters && !(props.entityType && props.entityId));
const selectedIds = ref<Set<string>>(new Set());
const bulkBusy = ref(false);

function isSelected(id: string | number) { return selectedIds.value.has(String(id)); }
function toggleSelect(id: string | number) {
  const next = new Set(selectedIds.value);
  const key = String(id);
  next.has(key) ? next.delete(key) : next.add(key);
  selectedIds.value = next;
}

const pendingRows = computed(() => actions.value.filter((a) => a.status === 'pending'));
const selectedCount = computed(() => selectedIds.value.size);
const allPendingSelected = computed(() =>
  pendingRows.value.length > 0 && pendingRows.value.every((a) => selectedIds.value.has(String(a.id))));

function toggleSelectAllPending() {
  selectedIds.value = allPendingSelected.value
    ? new Set()
    : new Set(pendingRows.value.map((a) => String(a.id)));
}

async function bulkResolve(decision: 'approve' | 'reject') {
  if (bulkBusy.value) return;
  // Act only on rows that are still pending AND selected.
  const targets = pendingRows.value.filter((a) => selectedIds.value.has(String(a.id)));
  if (!targets.length) return;

  bulkBusy.value = true;
  // Optimistic flip + per-row snapshot for selective rollback.
  const snapshots = new Map<string, { status: string; result: any; error: any }>();
  for (const a of targets) {
    snapshots.set(String(a.id), { status: a.status, result: a.result, error: a.error });
    a.status = decision === 'approve' ? 'executed' : 'rejected';
  }

  try {
    const res = await $fetch<{ results: Array<{ id: string | number; status: string; result?: any; error?: string }> }>(
      '/api/ai/actions/bulk',
      { method: 'POST', body: { ids: targets.map((a) => a.id), decision } },
    );
    const byId = new Map((res?.results || []).map((r) => [String(r.id), r]));

    let failedCount = 0;
    for (const a of targets) {
      const r = byId.get(String(a.id));
      if (!r || r.status === 'failed') {
        // Roll this row back to its pre-flip state.
        const snap = snapshots.get(String(a.id));
        if (snap) { a.status = snap.status; a.result = snap.result; a.error = snap.error; }
        failedCount++;
      } else {
        a.status = r.status;
        if (r.result) a.result = r.result;
        a.error = null;
      }
    }

    const okCount = targets.length - failedCount;
    const verb = decision === 'approve' ? 'Approved' : 'Rejected';
    toast.add({
      title: failedCount ? `${verb} ${okCount}, ${failedCount} failed` : `${verb} ${okCount}`,
      color: failedCount ? (okCount ? 'yellow' : 'red') : 'green',
    });
    selectedIds.value = new Set();
    refreshPendingActions();
  } catch (err: any) {
    // Whole request failed — roll every optimistic flip back.
    for (const a of targets) {
      const snap = snapshots.get(String(a.id));
      if (snap) { a.status = snap.status; a.result = snap.result; a.error = snap.error; }
    }
    toast.add({
      title: decision === 'approve' ? 'Could not approve selection' : 'Could not reject selection',
      description: err?.data?.message || err?.message,
      color: 'red',
    });
  } finally {
    bulkBusy.value = false;
  }
}

// ── Presentation ─────────────────────────────────────────────────────────────
const ACTION_LABELS: Record<string, string> = {
  generate_documents: 'Drafted documents',
  draft_email: 'Drafted email',
  send_email: 'Sent email',
  create_tasks: 'Created tasks',
  update_field: 'Updated a field',
  other: 'Action',
};

const STATUS_STYLES: Record<string, { label: string; class: string }> = {
  pending: { label: 'Pending', class: 'bg-warning/10 text-warning' },
  approved: { label: 'Approved', class: 'bg-info/10 text-info' },
  rejected: { label: 'Rejected', class: 'bg-muted text-muted-foreground' },
  executed: { label: 'Done', class: 'bg-success/10 text-success' },
  failed: { label: 'Failed', class: 'bg-destructive/10 text-destructive' },
};

function actionLabel(a: any) {
  return ACTION_LABELS[a?.action_type] || a?.action_type || 'Action';
}
function statusStyle(a: any) {
  // Stale proposals retired by the expiry cron are stored as `rejected` +
  // error 'auto-expired …' (no new enum value) — surface them as "Expired".
  if (a?.status === 'rejected' && typeof a?.error === 'string' && a.error.startsWith('auto-expired')) {
    return { label: 'Expired', class: 'bg-muted text-muted-foreground' };
  }
  return STATUS_STYLES[a?.status] || { label: a?.status || '—', class: 'bg-muted text-muted-foreground' };
}
// Auto-expired rows carry a machine-ish error string; don't render it as a red
// error line (it isn't a failure — the "Expired" chip already says it).
function isExpired(a: any) {
  return a?.status === 'rejected' && typeof a?.error === 'string' && a.error.startsWith('auto-expired');
}

function formatTime(ts?: string | null) {
  if (!ts) return '';
  const date = new Date(ts);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Email preview (send_email) ─────────────────────────────────────────────────
// Once AI_SEND_EMAIL_DRYRUN=false a send is real, so an approver must see the
// recipient + subject + body before clicking Approve. The preview is captured
// at propose time (server/utils/llm/tool-proposals.ts).
const expandedIds = ref<Set<string | number>>(new Set());
function toggleExpanded(id: string | number) {
  const next = new Set(expandedIds.value);
  next.has(id) ? next.delete(id) : next.add(id);
  expandedIds.value = next;
}
function emailPreview(a: any): { to: string | null; subject: string; body: string } | null {
  const p = a?.preview;
  if (a?.action_type !== 'send_email' || !p || p.kind !== 'email') return null;
  const to = p.to || (p.contactId ? `contact ${p.contactId}` : null);
  const body = stripHtml(p.bodyHtml || '');
  return { to, subject: p.subject || '', body };
}
function stripHtml(html: string): string {
  return String(html)
    .replace(/<br\s*\/?>(?=\S)/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Real artifacts this action produced, as clickable links into the slide-over stack.
function artifactLinks(a: any): Array<{ label: string; open: () => void }> {
  const links: Array<{ label: string; open: () => void }> = [];
  const proposalId = a?.result?.proposalId;
  const contractId = a?.result?.contractId;
  if (proposalId) links.push({ label: 'View proposal', open: () => proposalSlide.open(String(proposalId), 'edit') });
  if (contractId) links.push({ label: 'View contract', open: () => contractSlide.open(String(contractId), 'edit') });
  return links;
}
</script>

<template>
  <div>
    <!-- Status filter chips (review queue) -->
    <div v-if="showFilters && !(entityType && entityId)" class="flex items-center gap-1.5 mb-3">
      <button
        v-for="f in STATUS_FILTERS"
        :key="f.key"
        type="button"
        class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
        :class="statusFilter === f.key
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted/50 text-muted-foreground hover:bg-muted'"
        @click="statusFilter = f.key"
      >
        {{ f.label }}
      </button>
      <!-- Select-all affordance: only when there are pending rows to batch. -->
      <button
        v-if="canSelect && pendingRows.length"
        type="button"
        class="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        @click="toggleSelectAllPending"
      >
        <UIcon :name="allPendingSelected ? 'lucide:square-check' : 'lucide:square'" class="w-3.5 h-3.5" />
        {{ allPendingSelected ? 'Clear' : `Select all pending (${pendingRows.length})` }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-3">
      <div v-for="n in 4" :key="n" class="flex items-start gap-3">
        <div class="w-7 h-7 rounded-full bg-muted animate-pulse shrink-0" />
        <div class="flex-1 space-y-1.5">
          <div class="h-3 w-40 bg-muted rounded animate-pulse" />
          <div class="h-2 w-24 bg-muted rounded animate-pulse" />
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="px-3 py-2 rounded-xl bg-destructive/10 text-xs text-destructive">
      {{ error }}
    </div>

    <!-- Empty -->
    <div v-else-if="!actions.length" class="text-center py-10">
      <UIcon name="lucide:sparkles" class="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
      <p class="text-sm text-muted-foreground">No AI activity yet</p>
      <p class="text-[11px] text-muted-foreground/70 mt-0.5">Actions Earnest takes will show up here.</p>
    </div>

    <!-- Feed -->
    <div v-else class="space-y-2">
      <div
        v-for="a in actions"
        :key="a.id"
        class="ios-card p-3"
      >
        <div class="flex items-start gap-2.5">
          <!-- Selection checkbox: pending rows only, review-queue only. -->
          <button
            v-if="canSelect && a.status === 'pending'"
            type="button"
            class="w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-1 transition-colors"
            :class="isSelected(a.id)
              ? 'bg-primary border-primary text-primary-foreground'
              : 'border-border bg-background hover:border-primary/60'"
            :aria-pressed="isSelected(a.id)"
            :aria-label="isSelected(a.id) ? 'Deselect' : 'Select'"
            @click="toggleSelect(a.id)"
          >
            <UIcon v-if="isSelected(a.id)" name="lucide:check" class="w-3 h-3" />
          </button>
          <div class="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <EarnestIcon class="w-3.5 h-3.5 text-primary" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs font-medium text-foreground">{{ actionLabel(a) }}</span>
              <span
                class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide"
                :class="statusStyle(a).class"
              >
                {{ statusStyle(a).label }}
              </span>
              <span
                v-if="a.preview?.source === 'proactive'"
                class="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide bg-primary/10 text-primary"
                title="Earnest proposed this proactively"
              >
                <UIcon name="lucide:sparkles" class="w-2.5 h-2.5" />
                Proactive
              </span>
              <span class="text-[10px] text-muted-foreground">{{ formatTime(a.date_created) }}</span>
            </div>
            <p v-if="a.title" class="text-[11px] text-muted-foreground mt-0.5 break-words">{{ a.title }}</p>
            <p v-if="a.error && !isExpired(a)" class="text-[11px] text-destructive mt-0.5 break-words">{{ a.error }}</p>

            <div v-if="artifactLinks(a).length" class="flex items-center gap-3 mt-1.5">
              <button
                v-for="link in artifactLinks(a)"
                :key="link.label"
                type="button"
                class="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                @click="link.open"
              >
                <UIcon name="lucide:external-link" class="w-3 h-3" />
                {{ link.label }}
              </button>
            </div>

            <!-- Email preview (send_email): recipient + subject always shown so a
                 live send is never approved blind; body behind a toggle. -->
            <div v-if="emailPreview(a)" class="mt-2 rounded-xl bg-muted/40 border border-border/40 p-2.5">
              <div class="flex items-baseline gap-1.5 text-[11px]">
                <span class="text-muted-foreground shrink-0">To</span>
                <span class="font-medium text-foreground break-all">{{ emailPreview(a)!.to || '—' }}</span>
              </div>
              <div class="flex items-baseline gap-1.5 text-[11px] mt-0.5">
                <span class="text-muted-foreground shrink-0">Subject</span>
                <span class="font-medium text-foreground break-words">{{ emailPreview(a)!.subject || '—' }}</span>
              </div>
              <button
                type="button"
                class="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                @click="toggleExpanded(a.id)"
              >
                <UIcon :name="expandedIds.has(a.id) ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="w-3 h-3" />
                {{ expandedIds.has(a.id) ? 'Hide email' : 'Show email' }}
              </button>
              <p
                v-if="expandedIds.has(a.id)"
                class="mt-1.5 text-[11px] text-muted-foreground whitespace-pre-wrap break-words border-t border-border/40 pt-1.5"
              >{{ emailPreview(a)!.body }}</p>
            </div>

            <!-- HITL controls: only pending actions are actionable. -->
            <div v-if="a.status === 'pending'" class="flex items-center gap-2 mt-2">
              <Button
                size="sm"
                class="h-7 rounded-full px-3 text-[11px]"
                :disabled="isBusy(a.id)"
                @click="resolveAction(a, 'approve')"
              >
                <UIcon v-if="isBusy(a.id)" name="lucide:loader-2" class="w-3 h-3 animate-spin" />
                <UIcon v-else name="lucide:check" class="w-3 h-3" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                class="h-7 rounded-full px-3 text-[11px]"
                :disabled="isBusy(a.id)"
                @click="resolveAction(a, 'reject')"
              >
                <UIcon name="lucide:x" class="w-3 h-3" />
                Reject
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Sticky bulk action bar: appears once ≥1 pending row is selected. -->
    <div
      v-if="canSelect && selectedCount"
      class="sticky bottom-0 z-10 mt-3 flex items-center gap-2 rounded-2xl border border-border/60 bg-background/85 backdrop-blur px-3 py-2 shadow-lg"
    >
      <span class="text-[11px] font-medium text-muted-foreground">{{ selectedCount }} selected</span>
      <div class="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          class="h-7 rounded-full px-3 text-[11px]"
          :disabled="bulkBusy"
          @click="bulkResolve('approve')"
        >
          <UIcon v-if="bulkBusy" name="lucide:loader-2" class="w-3 h-3 animate-spin" />
          <UIcon v-else name="lucide:check" class="w-3 h-3" />
          Approve {{ selectedCount }}
        </Button>
        <Button
          size="sm"
          variant="outline"
          class="h-7 rounded-full px-3 text-[11px]"
          :disabled="bulkBusy"
          @click="bulkResolve('reject')"
        >
          <UIcon name="lucide:x" class="w-3 h-3" />
          Reject {{ selectedCount }}
        </Button>
      </div>
    </div>
  </div>
</template>
