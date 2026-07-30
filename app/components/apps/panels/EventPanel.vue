<!--
  EventPanel — slide-over body for a project event (milestone).

  Two modes, both rendered inside the shared slide-over stack:
    • view (default) — wraps `<AppsWorkEventWorkspace>` in `compact` mode so the
      panel renders the same workspace as `/projects/[id]/events/[event]`.
    • create (`mode="create"`) — `id` is the PARENT project id; renders the
      rich new-event form (`<AppsPanelsEventCreateForm>`). On save it bumps a
      project-scoped refresh signal so the underlying workspace's timeline
      refetches, then swaps IN PLACE to the new event's detail workspace — where
      the collaborative relations (comments, reactions, meetings, ongoing tasks)
      live — instead of popping the panel.
-->
<script setup lang="ts">
import type { FlipFromPayload } from '~/composables/useFlipFromRow';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string; flipFrom?: FlipFromPayload | null }>();
defineEmits<{ (e: 'close'): void }>();

const isCreate = computed(() => props.mode === 'create');
// In create mode this holds the id of the just-created event so the panel can
// swap from the form into the detail workspace without a remount.
const createdEventId = ref<string | null>(null);
const showForm = computed(() => isCreate.value && !createdEventId.value);
// The event the view workspace should render: the created one in create mode,
// otherwise the id we were opened with.
const viewEventId = computed(() => (isCreate.value ? createdEventId.value : props.id));

/* ---- view mode ---- */
const event = ref<any | null>(null);
const { setEntity, entityId, resetEntityContext } = useEntityPageContext();

function onLoaded(e: any) {
  event.value = e;
  if (e?.id) setEntity('project_event', String(e.id), e.title || e.name || 'Event');
}

const title = computed(() => (showForm.value ? 'New Event' : event.value?.title || 'Event'));
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
// Project-scoped signal the parent ProjectWorkspace watches to remount its Gantt.
const eventsRefresh = useState<number>(`project-events-refresh:${props.id}`, () => 0);

// The rich create form persisted the event (+ its files/invoices/tasks/etc).
// Refresh the parent timeline and swap this panel into the event's detail view.
function onCreated(eventId: string) {
  eventsRefresh.value++;
  createdEventId.value = eventId;
}

onBeforeUnmount(() => {
  // Release the AI-sidebar entity context if we own it (view mode, or a
  // create flow that has since swapped into the created event's workspace).
  const owned = event.value?.id ? String(event.value.id) : null;
  if (owned && entityId.value === owned) resetEntityContext();
});
</script>

<template>
  <AppSlideOverShell
    :title="title"
    :subtitle="showForm ? null : subtitle"
    :flip-from="flipFrom"
    @close="$emit('close')"
  >
    <template v-if="!showForm" #hero>
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
    <!-- The event's full detail already renders in-stack below, so there's no
         "open full page" action — the standalone /projects/[id]/events/[event]
         route stays only for direct URL / email deep-links. -->

    <!-- Create mode — the rich new-event form. -->
    <AppsPanelsEventCreateForm
      v-if="showForm"
      :project-id="id"
      @created="onCreated"
    />

    <AppsWorkEventWorkspace
      v-else-if="viewEventId"
      :event-id="viewEventId"
      compact
      @loaded="onLoaded"
      @back="$emit('close')"
    />
  </AppSlideOverShell>
</template>
