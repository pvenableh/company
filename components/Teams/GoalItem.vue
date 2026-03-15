<template>
  <div class="flex items-start gap-3 p-3 bg-muted/30 rounded-xl group">
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 mb-1">
        <h4 class="text-sm font-medium truncate">{{ goal.title }}</h4>
        <span
          v-if="isOverdue"
          class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-red-500/15 text-red-400"
        >
          Overdue
        </span>
      </div>
      <p v-if="goal.description" class="text-xs text-muted-foreground line-clamp-1 mb-2">{{ goal.description }}</p>

      <!-- Progress Bar -->
      <div class="flex items-center gap-2">
        <div class="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all"
            :class="progressColor"
            :style="{ width: `${goal.progress || 0}%` }"
          />
        </div>
        <span class="text-xs font-medium text-muted-foreground w-8 text-right">{{ goal.progress || 0 }}%</span>
      </div>

      <p v-if="goal.target_date" class="text-[10px] text-muted-foreground mt-1">
        Target: {{ new Date(goal.target_date).toLocaleDateString() }}
      </p>
    </div>

    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        type="button"
        class="p-1 text-muted-foreground/40 hover:text-foreground transition-colors"
        @click="$emit('edit', goal)"
      >
        <Icon name="lucide:pencil" class="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        class="p-1 text-muted-foreground/40 hover:text-destructive transition-colors"
        @click="$emit('delete', goal)"
      >
        <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  goal: {
    id: string;
    title: string;
    description?: string;
    target_date?: string;
    progress?: number;
  };
}>();

defineEmits<{
  edit: [goal: any];
  delete: [goal: any];
}>();

const isOverdue = computed(() => {
  if (!props.goal.target_date) return false;
  return new Date(props.goal.target_date) < new Date() && (props.goal.progress || 0) < 100;
});

const progressColor = computed(() => {
  const p = props.goal.progress || 0;
  if (p >= 100) return 'bg-emerald-500';
  if (p >= 60) return 'bg-blue-500';
  if (p >= 30) return 'bg-yellow-500';
  return 'bg-red-500';
});
</script>
