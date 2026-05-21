<!--
  MeetingPanel — slide-over body for a single video meeting.

  Wraps the shared `<AppsWorkMeetingWorkspace>` in `compact` mode inside
  `AppSlideOverShell` so the panel renders the same workspace as
  `/meetings/[id]` without a full-route navigation.
-->
<script setup lang="ts">
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();

const meeting = ref<any | null>(null);

function onLoaded(m: any) {
  meeting.value = m;
}

const title = computed(() => meeting.value?.title || 'Meeting');
const subtitle = computed(() => {
  const m = meeting.value;
  if (!m) return null;
  const project = m.project_event?.project?.title || m.project?.title;
  const client = m.client?.name || m.project?.client?.name || m.related_organization?.name;
  return project || client || null;
});
</script>

<template>
  <AppSlideOverShell :title="title" :subtitle="subtitle" @close="$emit('close')">
    <template #actions>
      <NuxtLink
        :to="`/meetings/${id}`"
        class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        title="Open the meeting as a full page"
      >
        <Icon name="lucide:external-link" class="w-3 h-3" />
        Full Page
      </NuxtLink>
    </template>

    <AppsWorkMeetingWorkspace
      :meeting-id="id"
      compact
      @loaded="onLoaded"
      @back="$emit('close')"
    />
  </AppSlideOverShell>
</template>
