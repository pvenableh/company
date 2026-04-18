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

const formData = reactive({
  title: props.goal?.title || '',
  description: props.goal?.description || '',
  target_date: props.goal?.target_date?.split('T')[0] || '',
  progress: props.goal?.progress || 0,
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
