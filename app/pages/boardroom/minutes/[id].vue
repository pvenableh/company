<!--
  /boardroom/minutes/[id] — the read-only RECAP of a recorded Boardroom
  meeting (a director_minutes decision record).

  This is the async "decision room": a teammate who wasn't in the room opens the
  shared link and reads exactly what was reviewed and decided — the AI summary,
  the briefing re-staged as a non-interactive DirectorSlides deck, the action
  items captured, and the Q&A thread. Nothing here runs or mutates; the deck is
  mounted with canDecide/canCapture false so approve/skip/assign are all hidden.

  Reached from the "shared for review" notification, or from /boardroom → Decision
  records. The author can re-share it from here.
-->
<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });

const route = useRoute();
const minutesId = computed(() => String(route.params.id));

const { load, share } = useBoardroomMinutes();
const { selectedOrg } = useOrganization();
const { user } = useUserSession();
const toast = useToast();

const minutes = ref<Awaited<ReturnType<typeof load>>>(null);
const loading = ref(true);

useHead(() => ({ title: `${minutes.value?.title || 'Meeting minutes'} · Recap | Earnest` }));

async function fetchMinutes() {
  loading.value = true;
  minutes.value = await load(minutesId.value);
  loading.value = false;
}
onMounted(fetchMinutes);

const scopeLabel = computed(() => {
  const m = minutes.value;
  if (!m) return 'the organization';
  if (m.scopeType === 'entity' && m.entityType) return m.title || `the ${m.entityType.replace(/s$/, '')}`;
  if (m.scopeType === 'mine') return 'your own work';
  return 'the organization';
});

// TL;DR points ride either the stored `points` or are re-derived nowhere — the
// deck reads the intro on its own if points are absent.
const points = computed(() => minutes.value?.points || []);

const stats = computed(() => minutes.value?.stats || { done: 0, skipped: 0, failed: 0, open: 0, total: 0, captured: 0 });

function ago(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (!isFinite(diff) || diff < 60_000) return 'just now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function priorityClass(p?: string): string {
  return {
    urgent: 'bg-destructive/10 text-destructive',
    high: 'bg-warning/10 text-warning',
    medium: 'bg-info/10 text-info',
    low: 'bg-muted text-muted-foreground',
  }[p || 'medium'] || 'bg-muted text-muted-foreground';
}

// The recap deck is read-only — swallow any decision/capture events defensively
// (they're hidden by canDecide/canCapture=false, but keep the handlers inert).
function noop() {}

// ── Share for review ─────────────────────────────────────────────────────────
const showShare = ref(false);
const isAuthor = computed(() => !!minutes.value && String(minutes.value.authorId) === String((user.value as any)?.id));

async function onShare(userIds: string[]) {
  showShare.value = false;
  if (!userIds.length) return;
  const n = await share(minutesId.value, userIds);
  if (n > 0) {
    toast.add({ title: `Shared with ${n} ${n === 1 ? 'teammate' : 'teammates'}`, description: 'They’ll get a notification with this recap.', icon: 'i-lucide-send', color: 'green' });
    await fetchMinutes(); // reflect status → shared
  }
}
</script>

<template>
  <LayoutPageContainer>
    <div v-if="loading" class="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center">
      <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> Loading the recap…
    </div>

    <div v-else-if="!minutes" class="rounded-2xl border border-dashed border-border p-10 text-center max-w-lg mx-auto mt-8">
      <div class="mx-auto mb-3 w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
        <UIcon name="i-lucide-file-x" class="w-6 h-6 text-muted-foreground" />
      </div>
      <p class="text-sm font-medium text-foreground">This decision record isn't available</p>
      <p class="text-xs text-muted-foreground mt-0.5">It may have been removed, or you don't have access to its organization.</p>
      <NuxtLink to="/boardroom" class="inline-flex items-center gap-1.5 mt-4 text-sm text-primary hover:underline">
        <UIcon name="i-lucide-arrow-left" class="w-4 h-4" /> Back to the Boardroom
      </NuxtLink>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="flex items-start justify-between gap-4 pt-2 mb-5">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-11 h-11 rounded-2xl bg-muted ring-1 ring-border flex items-center justify-center shrink-0">
            <UIcon name="i-lucide-gavel" class="w-6 h-6 text-muted-foreground" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-2xl font-bold text-foreground tracking-tight leading-tight truncate">{{ minutes.title || 'Meeting minutes' }}</h1>
              <span
                class="text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 font-medium"
                :class="minutes.status === 'shared' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'"
              >{{ minutes.status === 'shared' ? 'Shared' : 'Recorded' }}</span>
            </div>
            <p class="text-sm text-muted-foreground mt-0.5">
              Reviewed {{ scopeLabel }}<template v-if="minutes.authorName"> · {{ minutes.authorName }}</template>
              <template v-if="minutes.dateCreated"> · {{ ago(minutes.dateCreated) }}</template>
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            class="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-sm ios-press"
            title="Share this recap with teammates for review"
            @click="showShare = true"
          >
            <UIcon name="i-lucide-send" class="w-4.5 h-4.5" />
            <span class="hidden sm:inline">Share for review</span>
          </button>
        </div>
      </div>

      <!-- Summary + rollup -->
      <div class="rounded-2xl border border-border bg-card p-5 mb-5">
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
          <EarnestIcon class="w-3 h-3 text-primary" /> Summary
        </p>
        <p class="text-sm text-foreground whitespace-pre-line leading-relaxed">{{ minutes.summary || 'No summary was recorded.' }}</p>
        <div v-if="stats.total || stats.captured" class="flex items-center gap-5 mt-4 pt-3 border-t border-border/60 text-sm">
          <div v-if="stats.done" class="flex items-center gap-1.5"><span class="text-lg font-semibold text-success">{{ stats.done }}</span><span class="text-xs text-muted-foreground">approved</span></div>
          <div v-if="stats.skipped" class="flex items-center gap-1.5"><span class="text-lg font-semibold text-muted-foreground">{{ stats.skipped }}</span><span class="text-xs text-muted-foreground">skipped</span></div>
          <div v-if="stats.failed" class="flex items-center gap-1.5"><span class="text-lg font-semibold text-destructive">{{ stats.failed }}</span><span class="text-xs text-muted-foreground">failed</span></div>
          <div v-if="stats.open" class="flex items-center gap-1.5"><span class="text-lg font-semibold text-info">{{ stats.open }}</span><span class="text-xs text-muted-foreground">open</span></div>
          <div v-if="stats.captured" class="flex items-center gap-1.5"><span class="text-lg font-semibold text-foreground">{{ stats.captured }}</span><span class="text-xs text-muted-foreground">action items</span></div>
        </div>
      </div>

      <!-- The briefing, re-staged as a read-only deck -->
      <div class="mb-5">
        <CommandCenterDirectorSlides
          :subject="minutes.subject"
          :scope-label="scopeLabel"
          :intro="minutes.intro || ''"
          :points="points"
          :finance="minutes.finance"
          :opportunity="minutes.opportunity"
          :client-rating="minutes.clientRating"
          :steps="minutes.steps as any"
          :can-decide="false"
          :can-capture="false"
          @approve="noop"
          @skip="noop"
          @capture="noop"
          @assign="noop"
        />
      </div>

      <!-- Action items captured -->
      <div v-if="minutes.captured.length" class="rounded-2xl border border-border bg-card p-5 mb-5">
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3 flex items-center gap-1.5">
          <UIcon name="i-lucide-clipboard-check" class="w-3.5 h-3.5" /> Action items captured
        </p>
        <ul class="space-y-2">
          <li v-for="(c, i) in minutes.captured" :key="i" class="flex items-center gap-3">
            <span class="w-7 h-7 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
              <UIcon :name="c.type === 'ticket' ? 'i-lucide-ticket' : 'i-lucide-list-checks'" class="w-4 h-4" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">{{ c.title }}</p>
              <p v-if="c.assignees?.length" class="text-xs text-muted-foreground truncate">→ {{ c.assignees.join(', ') }}</p>
            </div>
            <span v-if="c.priority" class="text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 font-medium capitalize shrink-0" :class="priorityClass(c.priority)">{{ c.priority }}</span>
          </li>
        </ul>
      </div>

      <!-- Q&A thread -->
      <div v-if="minutes.qa.length" class="rounded-2xl border border-border bg-card p-5 mb-8">
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3 flex items-center gap-1.5">
          <EarnestIcon class="w-3 h-3 text-primary" /> Asked in the room
        </p>
        <div class="space-y-2">
          <div v-for="(t, i) in minutes.qa" :key="i" class="flex" :class="t.role === 'user' ? 'justify-end' : 'justify-start'">
            <div
              class="max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line"
              :class="t.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'"
            >{{ t.text }}</div>
          </div>
        </div>
      </div>
    </template>

    <!-- Share for review -->
    <CommandCenterDirectorInvitePicker
      v-if="showShare && minutes && selectedOrg"
      :organization-id="selectedOrg"
      title="Share minutes for review"
      subtitle="They'll get the recap to review on their own time."
      cta="Share recap"
      icon="i-lucide-gavel"
      @invite="onShare"
      @close="showShare = false"
    />
  </LayoutPageContainer>
</template>
