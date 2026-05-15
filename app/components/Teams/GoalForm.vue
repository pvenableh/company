<template>
  <form @submit.prevent="handleSubmit" class="space-y-4">
    <div class="space-y-1">
      <label class="t-label text-muted-foreground">Title *</label>
      <UInput v-model="formData.title" required placeholder="Goal title" />
    </div>

    <div class="space-y-1">
      <label class="t-label text-muted-foreground">Description</label>
      <UTextarea v-model="formData.description" :rows="2" placeholder="What does this goal aim to achieve?" />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-1">
        <label class="t-label text-muted-foreground">Target Date</label>
        <UInput v-model="formData.target_date" type="date" />
      </div>
      <div class="space-y-1">
        <label class="t-label text-muted-foreground">Progress ({{ formData.progress }}%)</label>
        <input
          v-model.number="formData.progress"
          type="range"
          min="0"
          max="100"
          step="5"
          class="w-full mt-2"
        />
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
const props = defineProps<{
  goal?: any;
  saving?: boolean;
}>();

const emit = defineEmits<{
  save: [data: any];
}>();

// Goal rows live in the unified `goals` collection (scope='team'). New rows
// use `end_date` + `current_value` (with target_value=100, target_unit='%').
// Accept the older `target_date`/`progress` shape too so legacy edits still
// render — present for one rev while in-flight rows finish migrating in UI.
const legacyDate = props.goal?.target_date ?? props.goal?.end_date ?? '';
const legacyProgress =
  typeof props.goal?.progress === 'number' ? props.goal.progress
  : typeof props.goal?.current_value === 'number' ? props.goal.current_value
  : 0;

const formData = reactive({
  title: props.goal?.title || '',
  description: props.goal?.description || '',
  target_date: typeof legacyDate === 'string' ? legacyDate.split('T')[0] : '',
  progress: legacyProgress,
});

function handleSubmit() {
  emit('save', {
    title: formData.title,
    description: formData.description || undefined,
    target_date: formData.target_date || null,
    progress: formData.progress,
  });
}

defineExpose({
  triggerSubmit: handleSubmit,
  hasTitle: computed(() => !!formData.title?.trim()),
});
</script>
