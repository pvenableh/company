<!--
  EventPanel — slide-over body for a project event (milestone).

  Wraps the shared `<AppsWorkEventWorkspace>` in `compact` mode inside
  `AppSlideOverShell` so the panel renders the same workspace as
  `/projects/[id]/events/[event]` without a full-route navigation.
-->
<script setup lang="ts">
import type { FlipFromPayload } from '~/composables/useFlipFromRow';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string; flipFrom?: FlipFromPayload | null }>();
defineEmits<{ (e: 'close'): void }>();

const event = ref<any | null>(null);
const { setEntity, entityId, resetEntityContext } = useEntityPageContext();

function onLoaded(e: any) {
  event.value = e;
  if (e?.id) setEntity('project_event', String(e.id), e.title || e.name || 'Event');
}

const title = computed(() => event.value?.title || 'Event');
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

onBeforeUnmount(() => {
  if (entityId.value === String(props.id)) resetEntityContext();
});
</script>

<template>
  <AppSlideOverShell
    :title="title"
    :subtitle="subtitle"
    :flip-from="flipFrom"
    @close="$emit('close')"
  >
    <template #hero>
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
    <template #actions>
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

    <AppsWorkEventWorkspace
      :event-id="id"
      compact
      @loaded="onLoaded"
      @back="$emit('close')"
    />
  </AppSlideOverShell>
</template>
