<!--
  TaskPanel — slide-over body for a single task.

  Wraps the shared `<AppsWorkTaskWorkspace>` in `compact` mode inside
  `AppSlideOverShell`. Tasks have no `/tasks/[id]` route today, so this
  slide-over is the canonical detail surface; opens via
  `useAppSlideOver('task').open(id)` from any list row.
-->
<script setup lang="ts">
import type { FlipFromPayload } from '~/composables/useFlipFromRow';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string; flipFrom?: FlipFromPayload | null }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const task = ref<any | null>(null);
const { setEntity, entityId, resetEntityContext } = useEntityPageContext();

function onLoaded(t: any) {
  task.value = t;
  // Register task context so Earnest is aware of what you're viewing in the
  // slide-over (tasks have no full page, so this panel is the only surface).
  setEntity('task', String(t.id), t.title || 'Task');
}

const title = computed(() => task.value?.title || 'Task');
const subtitle = computed(() => {
  const t = task.value;
  if (!t) return null;
  const project = typeof t.project_id === 'object' ? t.project_id?.title : null;
  return project || null;
});

const statusLabel = computed(() => {
  const s = (task.value as any)?.status;
  if (s === 'completed') return 'Done';
  if (s === 'in_progress') return 'In Progress';
  if (s === 'new') return 'To Do';
  return s || null;
});
const priorityLabel = computed(() => {
  const p = (task.value as any)?.priority;
  return p && p !== 'medium' ? p : null;
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
            {{ task?.title || 'Task' }}
          </p>
          <p v-if="subtitle || priorityLabel" class="text-[11px] text-muted-foreground truncate mt-0.5">
            {{ [subtitle, priorityLabel ? priorityLabel + ' priority' : null].filter(Boolean).join(' · ') }}
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

    <AppsWorkTaskWorkspace
      :task-id="id"
      compact
      @loaded="onLoaded"
      @back="$emit('close')"
      @deleted="$emit('close')"
    />
  </AppSlideOverShell>
</template>
