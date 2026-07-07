<!--
  CreateWithEarnest — a compact "Create with Earnest" menu for a detail
  slide-over. Each item opens the Earnest panel pre-loaded with a create prompt
  (via openEarnestPanel), which auto-sends scoped to the currently-focused
  entity, so the approval-gated tool fires for THIS client/project/lead.

    <AppsCreateWithEarnest entity-type="client" />

  Dependency-free popover (no teleport) so it behaves inside the transformed
  slide-over container.
-->
<script setup lang="ts">
const props = defineProps<{
  entityType: string;
  label?: string;
}>();

const { openEarnestPanel } = useEarnestPanel();

interface CreateAction { label: string; icon: string; prompt: string }

const ACTIONS: Record<string, CreateAction[]> = {
  client: [
    { label: 'New project', icon: 'lucide:folder-plus', prompt: 'Create a new project for this client with a short timeline of phases and a few tasks under each.' },
    { label: 'Proposal & contract', icon: 'lucide:file-text', prompt: 'Draft a proposal and a contract for this client based on what you know about them.' },
    { label: 'Invoice', icon: 'lucide:receipt', prompt: 'Create an invoice for this client for recent work.' },
    { label: 'Ticket', icon: 'lucide:ticket', prompt: 'Create a ticket for this client for a specific request, with a couple of tasks.' },
    { label: 'Task', icon: 'lucide:check-square', prompt: 'Add a follow-up task for this client.' },
    { label: 'Email', icon: 'lucide:mail', prompt: 'Draft a follow-up email to this client.' },
  ],
  project: [
    { label: 'Add a phase / event', icon: 'lucide:flag', prompt: 'Add a phase to this project with a couple of tasks under it.' },
    { label: 'Add tasks', icon: 'lucide:check-square', prompt: 'Add a few tasks to this project.' },
    { label: 'Ticket', icon: 'lucide:ticket', prompt: 'Create a ticket on this project for a specific request, with a couple of tasks.' },
    { label: 'Invoice', icon: 'lucide:receipt', prompt: 'Create an invoice for this project\'s client for recent work.' },
    { label: 'Reschedule', icon: 'lucide:calendar-clock', prompt: 'Reschedule this project — push the dates out by two weeks and cascade to events and tasks.' },
  ],
  lead: [
    { label: 'Proposal & contract', icon: 'lucide:file-text', prompt: 'Draft a proposal and contract for this lead.' },
    { label: 'Task', icon: 'lucide:check-square', prompt: 'Add a follow-up task for this lead.' },
    { label: 'Email', icon: 'lucide:mail', prompt: 'Draft an outreach email to this lead.' },
  ],
};

const actions = computed(() => ACTIONS[props.entityType] || []);

const open = ref(false);
function toggle() { open.value = !open.value; }
function close() { open.value = false; }
function run(a: CreateAction) {
  close();
  openEarnestPanel(a.prompt);
}
</script>

<template>
  <div v-if="actions.length" class="relative inline-flex">
    <button
      type="button"
      class="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium bg-primary/10 text-primary hover:bg-primary/15 active:scale-95 transition-all"
      @click="toggle"
    >
      <EarnestIcon class="w-3.5 h-3.5" />
      <span class="hidden sm:inline">{{ label || 'Create with Earnest' }}</span>
      <Icon :name="open ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="w-3 h-3" />
    </button>

    <template v-if="open">
      <div class="fixed inset-0 z-40" @click="close" />
      <div
        class="absolute z-50 top-full right-0 mt-2 w-60 max-w-[80vw] rounded-2xl border border-border bg-card shadow-xl p-1.5"
        @click.stop
      >
        <p class="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Ask Earnest to…</p>
        <button
          v-for="a in actions"
          :key="a.label"
          type="button"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-sm text-foreground hover:bg-primary/5 transition-colors text-left"
          @click="run(a)"
        >
          <Icon :name="a.icon" class="w-3.5 h-3.5 text-primary/70 shrink-0" />
          {{ a.label }}
        </button>
        <p class="px-2 pt-1 pb-0.5 text-[10px] text-muted-foreground">Earnest drafts it — you approve before anything is created.</p>
      </div>
    </template>
  </div>
</template>
