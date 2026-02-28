<script setup lang="ts">
const props = withDefaults(defineProps<{
  loading?: boolean;
  placeholder?: string;
  compact?: boolean;
}>(), {
  loading: false,
  placeholder: 'Write a comment...',
  compact: false,
});

const emit = defineEmits<{
  submit: [content: string];
  cancel: [];
}>();

const content = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const canSubmit = computed(() => content.value.trim().length > 0 && !props.loading);

function handleSubmit() {
  if (!canSubmit.value) return;
  emit('submit', content.value.trim());
  content.value = '';
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    handleSubmit();
  }
  if (e.key === 'Escape') {
    emit('cancel');
  }
}

onMounted(() => {
  if (props.compact && textareaRef.value) {
    textareaRef.value.focus();
  }
});
</script>

<template>
  <div class="comment-editor">
    <Textarea
      ref="textareaRef"
      v-model="content"
      :placeholder="placeholder"
      :rows="compact ? 2 : 3"
      class="text-sm resize-none"
      @keydown="handleKeydown"
    />
    <div class="flex items-center justify-between mt-2">
      <span class="text-[8px] text-gray-400">
        Press <kbd class="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[7px]">Cmd+Enter</kbd> to submit
      </span>
      <div class="flex items-center gap-1.5">
        <Button
          v-if="compact"
          variant="ghost"
          size="sm"
          class="h-6 text-[9px] uppercase tracking-wider"
          @click="emit('cancel')"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          class="h-6 text-[9px] uppercase tracking-wider"
          :disabled="!canSubmit"
          @click="handleSubmit"
        >
          <span v-if="loading" class="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent mr-1" />
          {{ loading ? 'Posting...' : 'Comment' }}
        </Button>
      </div>
    </div>
  </div>
</template>
