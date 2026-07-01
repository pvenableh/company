<!--
  MeetingPanel — slide-over body for a single video meeting.

  Wraps the shared `<AppsWorkMeetingWorkspace>` in `compact` mode inside
  `AppSlideOverShell` so the panel renders the same workspace as
  `/meetings/[id]` without a full-route navigation.
-->
<script setup lang="ts">
import type { FlipFromPayload } from '~/composables/useFlipFromRow';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string; flipFrom?: FlipFromPayload | null }>();
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

const startsAt = computed(() => {
  const m: any = meeting.value;
  if (!m?.scheduled_at) return null;
  try {
    return new Date(m.scheduled_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return null; }
});
const statusLabel = computed(() => (meeting.value as any)?.status || null);
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
            {{ meeting?.title || 'Meeting' }}
          </p>
          <p v-if="startsAt || subtitle" class="text-[11px] text-muted-foreground truncate mt-0.5">
            {{ [startsAt, subtitle].filter(Boolean).join(' · ') }}
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
        :to="`/meetings/${id}`"
        class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all"
        title="Open the meeting as a full page"
      >
        <Icon name="lucide:arrow-up-right" class="w-3.5 h-3.5" />
        Open Meeting
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
