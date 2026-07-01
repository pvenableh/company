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
const props = defineProps<{
  entityType?: string | null;
  entityId?: string | null;
}>();

const { selectedOrg } = useOrganization();
const organizationId = computed(() => (selectedOrg.value as any)?.id || selectedOrg.value || '');

const proposalSlide = useAppSlideOver('proposal');
const contractSlide = useAppSlideOver('contract');

const actions = ref<any[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  if (!organizationId.value) { actions.value = []; loading.value = false; return; }
  loading.value = true;
  error.value = null;
  try {
    const res = await $fetch<{ actions: any[] }>('/api/ai/actions', {
      query: {
        organizationId: organizationId.value,
        ...(props.entityType && props.entityId
          ? { entityType: props.entityType, entityId: props.entityId }
          : {}),
      },
    });
    actions.value = res?.actions || [];
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
  return STATUS_STYLES[a?.status] || { label: a?.status || '—', class: 'bg-muted text-muted-foreground' };
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
              <span class="text-[10px] text-muted-foreground">{{ formatTime(a.date_created) }}</span>
            </div>
            <p v-if="a.title" class="text-[11px] text-muted-foreground mt-0.5 break-words">{{ a.title }}</p>
            <p v-if="a.error" class="text-[11px] text-destructive mt-0.5 break-words">{{ a.error }}</p>

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
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
