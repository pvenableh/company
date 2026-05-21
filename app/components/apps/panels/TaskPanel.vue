<!--
  TaskPanel — slide-over body for a single task.

  Wraps the shared `<AppsWorkTaskWorkspace>` in `compact` mode inside
  `AppSlideOverShell`. Tasks have no `/tasks/[id]` route today, so this
  slide-over is the canonical detail surface; opens via
  `useAppSlideOver('task').open(id)` from any list row.
-->
<script setup lang="ts">
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const task = ref<any | null>(null);

function onLoaded(t: any) {
  task.value = t;
}

const title = computed(() => task.value?.title || 'Task');
const subtitle = computed(() => {
  const t = task.value;
  if (!t) return null;
  const project = typeof t.project_id === 'object' ? t.project_id?.title : null;
  return project || null;
});
</script>

<template>
  <AppSlideOverShell :title="title" :subtitle="subtitle" @close="$emit('close')">
    <AppsWorkTaskWorkspace
      :task-id="id"
      compact
      @loaded="onLoaded"
      @back="$emit('close')"
      @deleted="$emit('close')"
    />
  </AppSlideOverShell>
</template>
