<script setup lang="ts">
/**
 * Note detail modal — view full content, edit title, manage tags, pin/archive/delete.
 */

const props = defineProps<{
  modelValue: boolean;
  noteId: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'deleted', noteId: string): void;
  (e: 'updated'): void;
}>();

const { fetchNote, updateNote, deleteNote, togglePin, activeNote } = useAINotes();
const router = useRouter();

const isEditing = ref(false);
const editTitle = ref('');
const editTagIds = ref<string[]>([]);
const saving = ref(false);

// Load note when modal opens or noteId changes
watch(() => [props.modelValue, props.noteId], async ([open, id]) => {
  if (open && id) {
    await fetchNote(id as string);
    if (activeNote.value) {
      editTitle.value = activeNote.value.title || '';
      editTagIds.value = ((activeNote.value.tags || []) as any[])
        .map((jn: any) => jn.ai_tags_id?.id || jn.ai_tags_id)
        .filter(Boolean);
    }
  }
}, { immediate: true });

const note = computed(() => activeNote.value);

const noteTags = computed(() => {
  return ((note.value?.tags || []) as any[])
    .map((jn: any) => jn.ai_tags_id)
    .filter(Boolean);
});

const saveEdits = async () => {
  if (!note.value || saving.value) return;
  saving.value = true;
  try {
    await updateNote((note.value as any).id, {
      title: editTitle.value,
      tagIds: editTagIds.value,
    });
    isEditing.value = false;
    emit('updated');
    // Reload to get fresh data
    await fetchNote((note.value as any).id);
  } finally {
    saving.value = false;
  }
};

const handlePin = async () => {
  if (!note.value) return;
  await togglePin((note.value as any).id);
  await fetchNote((note.value as any).id);
  emit('updated');
};

const handleDelete = async () => {
  if (!note.value) return;
  const id = (note.value as any).id;
  await deleteNote(id);
  emit('deleted', id);
  emit('update:modelValue', false);
};

const goToSession = () => {
  if (!note.value?.source_session) return;
  const sessionId = typeof note.value.source_session === 'string'
    ? note.value.source_session
    : (note.value.source_session as any)?.id;
  if (sessionId) {
    emit('update:modelValue', false);
    router.push(`/command-center/ai?session=${sessionId}`);
  }
};

// Simple markdown rendering
const renderedContent = computed(() => {
  let html = note.value?.content || '';
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-muted rounded text-xs">$1</code>');
  html = html.replace(/^### (.*)/gm, '<h4 class="font-semibold text-sm mt-3 mb-1">$1</h4>');
  html = html.replace(/^## (.*)/gm, '<h3 class="font-semibold mt-3 mb-1">$1</h3>');
  html = html.replace(/^# (.*)/gm, '<h2 class="font-bold text-lg mt-3 mb-1">$1</h2>');
  html = html.replace(/^- (.*)/gm, '<li class="ml-4 list-disc text-sm my-0.5">$1</li>');
  html = html.replace(/\n\n/g, '</p><p class="my-2">');
  html = html.replace(/\n/g, '<br>');
  return `<p class="my-2">${html}</p>`;
});

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};
</script>

<template>
  <UModal :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <UCard class="max-h-[80vh] flex flex-col">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <UIcon name="i-heroicons-bookmark-solid" class="w-4 h-4 text-primary" />
            </div>
            <div class="min-w-0 flex-1" v-if="!isEditing">
              <h3 class="text-sm font-semibold truncate">{{ note?.title || 'Untitled Note' }}</h3>
              <p class="text-[10px] text-muted-foreground">
                {{ formatDate((note as any)?.date_created) }}
              </p>
            </div>
            <UInput
              v-else
              v-model="editTitle"
              size="sm"
              class="flex-1"
              placeholder="Note title..."
            />
          </div>
          <div class="flex items-center gap-1">
            <button
              @click="handlePin"
              class="p-1.5 rounded-md hover:bg-muted transition-colors"
              :title="note?.is_pinned ? 'Unpin' : 'Pin'"
            >
              <UIcon
                :name="note?.is_pinned ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
                class="w-4 h-4"
                :class="note?.is_pinned ? 'text-amber-500' : 'text-muted-foreground'"
              />
            </button>
            <button
              v-if="!isEditing"
              @click="isEditing = true"
              class="p-1.5 rounded-md hover:bg-muted transition-colors"
              title="Edit"
            >
              <UIcon name="i-heroicons-pencil" class="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              @click="handleDelete"
              class="p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
              title="Delete"
            >
              <UIcon name="i-heroicons-trash" class="w-4 h-4 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        </div>
      </template>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto">
        <!-- Tags -->
        <div v-if="isEditing" class="mb-4">
          <p class="text-xs font-medium text-muted-foreground mb-1.5">Tags</p>
          <AITagSelector v-model="editTagIds" />
        </div>
        <div v-else-if="noteTags.length > 0" class="flex flex-wrap gap-1.5 mb-4">
          <span
            v-for="tag in noteTags"
            :key="tag.id"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
            :style="{ backgroundColor: (tag.color || '#6366f1') + '1a', color: tag.color || '#6366f1' }"
          >
            <span
              class="w-1.5 h-1.5 rounded-full"
              :style="{ backgroundColor: tag.color || '#6366f1' }"
            />
            {{ tag.name }}
            <span v-if="tag.entity_type" class="text-[9px] opacity-70">({{ tag.entity_type }})</span>
          </span>
        </div>

        <!-- Markdown content -->
        <div
          class="prose prose-sm dark:prose-invert max-w-none"
          v-html="renderedContent"
        />
      </div>

      <template #footer>
        <div class="flex items-center justify-between">
          <button
            v-if="note?.source_session"
            @click="goToSession"
            class="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <UIcon name="i-heroicons-chat-bubble-left-right" class="w-3.5 h-3.5" />
            View source conversation
          </button>
          <span v-else />

          <div class="flex gap-2">
            <UButton
              v-if="isEditing"
              variant="ghost"
              size="sm"
              @click="isEditing = false"
            >
              Cancel
            </UButton>
            <UButton
              v-if="isEditing"
              size="sm"
              :loading="saving"
              @click="saveEdits"
            >
              Save Changes
            </UButton>
            <UButton
              v-else
              variant="ghost"
              size="sm"
              @click="emit('update:modelValue', false)"
            >
              Close
            </UButton>
          </div>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
