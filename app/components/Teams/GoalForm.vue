<template>
  <form @submit.prevent="handleSubmit" class="space-y-4">
    <div>
      <label class="block text-sm font-medium mb-1">Title *</label>
      <input
        v-model="formData.title"
        required
        class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        placeholder="Goal title"
      />
    </div>

    <div>
      <label class="block text-sm font-medium mb-1">Description</label>
      <textarea
        v-model="formData.description"
        rows="2"
        class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        placeholder="What does this goal aim to achieve?"
      />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Target Date</label>
        <input
          v-model="formData.target_date"
          type="date"
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Progress ({{ formData.progress }}%)</label>
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

    <div class="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" size="sm" @click="$emit('cancel')">Cancel</Button>
      <Button type="submit" size="sm" :disabled="saving || !formData.title">
        {{ saving ? 'Saving...' : (goal ? 'Update' : 'Add Goal') }}
      </Button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';

const props = defineProps<{
  goal?: any;
  saving?: boolean;
}>();

const emit = defineEmits<{
  save: [data: any];
  cancel: [];
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
    target_date: formData.target_date || undefined,
    progress: formData.progress,
  });
}
</script>
