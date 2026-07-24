<script setup lang="ts">
/**
 * Modal for saving an AI chat message as a note.
 * Shows content preview, editable title, and tag selector.
 */

const props = defineProps<{
  modelValue: boolean;
  messageContent: string;
  sessionId: string;
  messageId: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'saved', note: any): void;
}>();

const { saveNoteFromMessage } = useAINotes();

const title = ref('');
const selectedTagIds = ref<string[]>([]);
const saving = ref(false);

// Auto-generate title from content
watch(() => props.messageContent, (content) => {
  if (content) {
    const plain = content.replace(/[#*_~`>\[\]()!|-]/g, '').trim();
    title.value = plain.substring(0, 80) + (plain.length > 80 ? '...' : '');
  }
}, { immediate: true });

const save = async () => {
  if (saving.value) return;
  saving.value = true;

  try {
    const note = await saveNoteFromMessage(
      props.sessionId,
      props.messageContent,
      props.messageId,
      title.value,
      selectedTagIds.value,
    );

    if (note) {
      emit('saved', note);
      emit('update:modelValue', false);
      // Reset form
      title.value = '';
      selectedTagIds.value = [];
    }
  } finally {
    saving.value = false;
  }
};

// Simple markdown-to-preview for the content display
const contentPreview = computed(() => {
  let html = props.messageContent || '';
  // Basic markdown rendering for preview
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-muted rounded text-xs">$1</code>');
  html = html.replace(/^### (.*)/gm, '<h4 class="font-semibold text-sm mt-2 mb-1">$1</h4>');
  html = html.replace(/^## (.*)/gm, '<h3 class="font-semibold mt-2 mb-1">$1</h3>');
  html = html.replace(/^# (.*)/gm, '<h2 class="font-bold mt-2 mb-1">$1</h2>');
  html = html.replace(/^- (.*)/gm, '<li class="ml-4 list-disc text-sm">$1</li>');
  html = html.replace(/\n/g, '<br>');
  return html;
});
</script>

<template>
  <AppsAppBottomSheet
    :model-value="modelValue"
    title="Save AI Note"
    subtitle="Save this insight for future reference"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="space-y-4">
      <!-- Title -->
      <EFormGroup label="Title">
        <EInput v-model="title" placeholder="Note title..." />
      </EFormGroup>

      <!-- Content preview -->
      <EFormGroup label="Content">
        <div
          class="max-h-48 overflow-y-auto p-3 bg-muted/30 rounded-lg border border-border/30 text-sm prose prose-sm dark:prose-invert max-w-none"
          v-html="contentPreview"
        />
      </EFormGroup>

      <!-- Tags -->
      <EFormGroup label="Tags">
        <AITagSelector v-model="selectedTagIds" />
      </EFormGroup>
    </div>

    <template #footer>
      <span />
      <div class="flex items-center gap-2">
        <EButton
          variant="ghost"
          @click="emit('update:modelValue', false)"
        >
          Cancel
        </EButton>
        <EButton
          @click="save"
          :loading="saving"
          :disabled="!messageContent.trim()"
        >
          <EIcon name="i-heroicons-bookmark" class="w-4 h-4 mr-1" />
          Save Note
        </EButton>
      </div>
    </template>
  </AppsAppBottomSheet>
</template>
