<!--
  EventPanel — slide-over body for a project event (milestone).

  Wraps the shared `<AppsWorkEventWorkspace>` in `compact` mode inside
  `AppSlideOverShell` so the panel renders the same workspace as
  `/projects/[id]/events/[event]` without a full-route navigation.
-->
<script setup lang="ts">
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();

const event = ref<any | null>(null);

function onLoaded(e: any) {
  event.value = e;
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
</script>

<template>
  <AppSlideOverShell :title="title" :subtitle="subtitle" @close="$emit('close')">
    <template #actions>
      <NuxtLink
        v-if="projectId"
        :to="`/projects/${projectId}/events/${id}`"
        class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        title="Open the event as a full page"
      >
        <Icon name="lucide:external-link" class="w-3 h-3" />
        Full Page
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
