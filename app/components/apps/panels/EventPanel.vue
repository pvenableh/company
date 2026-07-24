<!--
  EventPanel — slide-over body for a project event (milestone).

  Two modes, both rendered inside the shared slide-over stack:
    • view (default) — wraps `<AppsWorkEventWorkspace>` in `compact` mode so the
      panel renders the same workspace as `/projects/[id]/events/[event]`.
    • create (`mode="create"`) — `id` is the PARENT project id; renders the
      new-event form that used to live in a centered `<EModal>` on the project
      workspace. On save it bumps a project-scoped refresh signal so the
      underlying workspace's timeline refetches, then pops the panel.
-->
<script setup lang="ts">
import { toast } from 'vue-sonner';
import type { FlipFromPayload } from '~/composables/useFlipFromRow';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string; flipFrom?: FlipFromPayload | null }>();
defineEmits<{ (e: 'close'): void }>();

const isCreate = computed(() => props.mode === 'create');

/* ---- view mode ---- */
const event = ref<any | null>(null);
const { setEntity, entityId, resetEntityContext } = useEntityPageContext();

function onLoaded(e: any) {
  event.value = e;
  if (e?.id) setEntity('project_event', String(e.id), e.title || e.name || 'Event');
}

const title = computed(() => (isCreate.value ? 'New Event' : event.value?.title || 'Event'));
const subtitle = computed(() => {
  const e = event.value;
  if (!e) return null;
  const project = typeof e.project === 'object' ? e.project?.title : null;
  return project || null;
});

const projectId = computed(() => {
  const p = event.value?.project;
  if (!p) return null;
  return typeof p === 'object' ? p.id : p;
});

const statusLabel = computed(() => (event.value as any)?.status || null);
const eventDate = computed(() => {
  const e: any = event.value;
  const d = e?.start_date || e?.date;
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return null; }
});

/* ---- create mode ---- */
const { pop } = useAppSlideOverStack();
const eventItemsApi = useDirectusItems('project_events');
// Project-scoped signal the parent ProjectWorkspace watches to remount its Gantt.
const eventsRefresh = useState<number>(`project-events-refresh:${props.id}`, () => 0);

const EVENT_TYPE_OPTIONS = [
  { label: 'General', value: 'General' },
  { label: 'Design', value: 'Design' },
  { label: 'Content', value: 'Content' },
  { label: 'Timeline', value: 'Timeline' },
  { label: 'Financial', value: 'Financial' },
  { label: 'Hours', value: 'Hours' },
];
const EVENT_STATUS_OPTIONS = [
  { label: 'Scheduled', value: 'Scheduled' },
  { label: 'Active', value: 'Active' },
  { label: 'Completed', value: 'Completed' },
];
const creating = ref(false);
const form = reactive({
  title: '',
  description: '',
  type: 'General',
  status: 'Active',
  date: '',
  end_date: '',
  is_milestone: false,
});

async function handleCreate() {
  if (!form.title.trim() || creating.value) return;
  creating.value = true;
  try {
    const data: Record<string, any> = {
      title: form.title.trim(),
      type: form.type,
      status: form.status,
      project: props.id, // in create mode `id` is the parent project id
      is_milestone: form.is_milestone,
    };
    if (form.description.trim()) data.description = form.description.trim();
    // Mirror event_date into date (the Gantt prefers event_date, older code
    // reads date) so the new event lands on the timeline immediately.
    if (form.date) { data.date = form.date; data.event_date = form.date; }
    if (form.end_date) data.end_date = form.end_date;
    await eventItemsApi.create(data);
    toast.success('Event added');
    eventsRefresh.value++;
    pop();
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || 'Failed to add event');
  } finally {
    creating.value = false;
  }
}

onBeforeUnmount(() => {
  if (!isCreate.value && entityId.value === String(props.id)) resetEntityContext();
});
</script>

<template>
  <AppSlideOverShell
    :title="title"
    :subtitle="isCreate ? null : subtitle"
    :flip-from="flipFrom"
    @close="$emit('close')"
  >
    <template v-if="!isCreate" #hero>
      <div class="flex items-center justify-between gap-3 px-1 py-1.5">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-foreground truncate">
            {{ event?.title || 'Event' }}
          </p>
          <p v-if="eventDate || subtitle" class="text-[11px] text-muted-foreground truncate mt-0.5">
            {{ [eventDate, subtitle].filter(Boolean).join(' · ') }}
          </p>
        </div>
        <span
          v-if="statusLabel"
          class="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider shrink-0"
        >
          {{ statusLabel }}
        </span>
      </div>
    </template>
    <template v-if="!isCreate" #actions>
      <NuxtLink
        v-if="projectId"
        :to="`/projects/${projectId}/events/${id}`"
        class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all"
        title="Open the event as a full page"
      >
        <Icon name="lucide:arrow-up-right" class="w-3.5 h-3.5" />
        Open Event
      </NuxtLink>
    </template>

    <!-- Create mode — the new-event form (formerly a centered modal). -->
    <form v-if="isCreate" class="space-y-4" @submit.prevent="handleCreate">
      <div class="space-y-1">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Title *</label>
        <EInput v-model="form.title" placeholder="Event title" autofocus />
      </div>
      <div class="space-y-1">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Description</label>
        <ETextarea v-model="form.description" placeholder="What happens at this milestone?" :rows="3" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-1">
          <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Type</label>
          <ESelectMenu v-model="form.type" :options="EVENT_TYPE_OPTIONS" option-attribute="label" value-attribute="value" />
        </div>
        <div class="space-y-1">
          <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Status</label>
          <ESelectMenu v-model="form.status" :options="EVENT_STATUS_OPTIONS" option-attribute="label" value-attribute="value" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-1">
          <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Date</label>
          <EInput v-model="form.date" type="date" />
        </div>
        <div class="space-y-1">
          <label class="text-[10px] uppercase tracking-wider text-muted-foreground">End date</label>
          <EInput v-model="form.end_date" type="date" />
        </div>
      </div>
      <label class="flex items-center gap-2 text-xs text-foreground/80 cursor-pointer select-none">
        <input v-model="form.is_milestone" type="checkbox" class="rounded border-border" />
        Mark as milestone (diamond on the timeline)
      </label>
      <div class="flex justify-end pt-1">
        <Button size="sm" type="submit" :disabled="creating || !form.title.trim()">
          <Icon v-if="creating" name="lucide:loader-2" class="animate-spin w-3 h-3 mr-1" />
          Add Event
        </Button>
      </div>
    </form>

    <AppsWorkEventWorkspace
      v-else
      :event-id="id"
      compact
      @loaded="onLoaded"
      @back="$emit('close')"
    />
  </AppSlideOverShell>
</template>
