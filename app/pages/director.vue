<!--
  /director — the Director's Office as its own destination.

  The working meeting itself still runs in the global overlay
  (CommandCenter/DirectorOffice.vue) so it can be convened from anywhere; this
  page is the "app home": a Convene button + a history of past briefings
  (director_briefings, via /api/ai/director/history). Opening a past meeting
  re-opens the office in the same scope — its saved briefing loads instantly.
-->
<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });
useHead({ title: "Director's Office | Earnest" });

const { open: openDirectorOffice } = useDirectorOffice();
const { selectedOrg } = useOrganization();

interface Meeting {
  id: string | number;
  subject: string | null;
  topic: string | null;
  scope_type: string;
  entity_type: string | null;
  entity_id: string | null;
  cache_key: string;
  step_count: number;
  intro: string | null;
  date_created: string;
}

const meetings = ref<Meeting[]>([]);
const loading = ref(false);

async function load() {
  if (!selectedOrg.value) return;
  loading.value = true;
  try {
    const res = await $fetch<{ meetings: Meeting[] }>('/api/ai/director/history', { query: { organizationId: selectedOrg.value } });
    meetings.value = res.meetings || [];
  } catch {
    meetings.value = [];
  }
  loading.value = false;
}
watch(selectedOrg, load, { immediate: true });

function subjectLabel(m: Meeting): string {
  if (m.topic) return m.topic;
  const s = (m.subject || '').toLowerCase();
  return ({ money: 'The Money', clients: 'Clients', projects: 'Projects', leads: 'Pipeline', proposals: 'Proposals', tickets: 'Support' } as Record<string, string>)[s]
    || (m.subject ? m.subject.charAt(0).toUpperCase() + m.subject.slice(1) : 'Working session');
}
function subjectIcon(m: Meeting): string {
  const s = (m.subject || '').toLowerCase();
  if (s === 'money') return 'i-lucide-banknote';
  if (s === 'clients') return 'i-lucide-user-round';
  if (s === 'projects') return 'i-lucide-folder-kanban';
  if (s === 'leads') return 'i-lucide-trending-up';
  if (s === 'proposals') return 'i-lucide-file-text';
  if (s === 'tickets') return 'i-lucide-ticket';
  return 'i-lucide-sparkles';
}
function scopeNote(m: Meeting): string {
  if (m.scope_type === 'entity' && m.entity_type) return `Focused · ${m.entity_type.replace(/s$/, '')}`;
  return 'Org-wide';
}
function ago(iso: string): string {
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
function snippet(t: string | null): string {
  if (!t) return '';
  const clean = t.replace(/\s+/g, ' ').trim();
  return clean.length > 150 ? `${clean.slice(0, 150)}…` : clean;
}
function openMeeting(m: Meeting) {
  if (m.scope_type === 'entity' && m.entity_type && m.entity_id) {
    openDirectorOffice({ mode: 'entity', entityType: m.entity_type, entityId: m.entity_id, label: subjectLabel(m) });
  } else {
    openDirectorOffice();
  }
}
</script>

<template>
  <LayoutPageContainer>
    <div class="flex items-start justify-between gap-4 pt-2 mb-6">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-11 h-11 rounded-2xl bg-foreground text-background flex items-center justify-center shrink-0">
          <DirectorChairIcon class="w-6 h-6" />
        </div>
        <div class="min-w-0">
          <h1 class="text-[28px] font-bold text-foreground tracking-tight leading-tight">The Director's Office</h1>
          <p class="text-[15px] text-muted-foreground mt-0.5">Earnest AI reviews the business and proposes a plan you approve step by step.</p>
        </div>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-sm ios-press shrink-0"
        @click="openDirectorOffice()"
      >
        <DirectorChairIcon class="w-4 h-4" />
        <span class="hidden sm:inline">Convene the board</span>
        <span class="sm:hidden">Convene</span>
      </button>
    </div>

    <!-- Past meetings -->
    <div class="mb-3 flex items-center gap-2">
      <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Past meetings</p>
      <span v-if="meetings.length" class="text-[10px] text-muted-foreground">· {{ meetings.length }}</span>
    </div>

    <div v-if="loading" class="flex items-center gap-2 text-sm text-muted-foreground py-8">
      <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> Loading meeting history…
    </div>

    <div v-else-if="!meetings.length" class="rounded-2xl border border-dashed border-border p-8 text-center">
      <div class="mx-auto mb-3 w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
        <DirectorChairIcon class="w-6 h-6 text-muted-foreground" />
      </div>
      <p class="text-sm font-medium text-foreground">No meetings yet</p>
      <p class="text-xs text-muted-foreground mt-0.5 max-w-sm mx-auto">
        Convene the board and Earnest's briefings will be saved here — reopen any one to pick up where you left off.
      </p>
    </div>

    <div v-else class="grid gap-2 sm:grid-cols-2">
      <button
        v-for="m in meetings"
        :key="m.id"
        type="button"
        class="group text-left rounded-2xl border border-border bg-background p-3.5 transition-all hover:border-primary/40 hover:shadow-sm hover:-translate-y-0.5"
        @click="openMeeting(m)"
      >
        <div class="flex items-start gap-3">
          <span class="mt-0.5 w-9 h-9 rounded-xl bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary flex items-center justify-center shrink-0 transition-colors">
            <UIcon :name="subjectIcon(m)" class="w-4 h-4" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium truncate">{{ subjectLabel(m) }}</span>
              <span class="text-[11px] text-muted-foreground shrink-0">{{ ago(m.date_created) }}</span>
            </div>
            <p class="text-[11px] text-muted-foreground mt-0.5">
              {{ scopeNote(m) }}<span v-if="m.step_count"> · {{ m.step_count }} proposed step{{ m.step_count === 1 ? '' : 's' }}</span>
            </p>
            <p v-if="snippet(m.intro)" class="text-xs text-muted-foreground mt-1.5 line-clamp-2">{{ snippet(m.intro) }}</p>
          </div>
        </div>
      </button>
    </div>
  </LayoutPageContainer>
</template>
