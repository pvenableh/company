<script setup lang="ts">
/**
 * Tag selector with autocomplete, color badges, and inline tag creation.
 * Groups tags by type (Category / Entity) with colored dots.
 */
import type { AiTag } from '~~/shared/directus';

const props = defineProps<{
  modelValue: string[];
  organizationId?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void;
}>();

const { tags, fetchTags, createTag } = useAINotes();
const searchInput = ref('');
const isOpen = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

// Fetch tags on mount
onMounted(() => { fetchTags(); });

// Selected tag objects
const selectedTags = computed(() => {
  return tags.value.filter(t => props.modelValue.includes(t.id as string));
});

// Filtered tags for dropdown
const filteredTags = computed(() => {
  const q = searchInput.value.toLowerCase().trim();
  let available = tags.value.filter(t => !props.modelValue.includes(t.id as string));
  if (q) {
    available = available.filter(t => t.name.toLowerCase().includes(q));
  }
  return available;
});

const categoryResults = computed(() => filteredTags.value.filter(t => t.type === 'category'));
const entityResults = computed(() => filteredTags.value.filter(t => t.type === 'entity'));

const canCreateNew = computed(() => {
  const q = searchInput.value.trim();
  if (!q) return false;
  return !tags.value.some(t => t.name.toLowerCase() === q.toLowerCase());
});

const addTag = (tagId: string) => {
  if (!props.modelValue.includes(tagId)) {
    emit('update:modelValue', [...props.modelValue, tagId]);
  }
  searchInput.value = '';
};

const removeTag = (tagId: string) => {
  emit('update:modelValue', props.modelValue.filter(id => id !== tagId));
};

const createAndAdd = async () => {
  const name = searchInput.value.trim();
  if (!name) return;
  const tag = await createTag({ name, type: 'category' });
  if (tag?.id) {
    addTag(tag.id as string);
  }
  searchInput.value = '';
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && canCreateNew.value) {
    e.preventDefault();
    createAndAdd();
  }
  if (e.key === 'Backspace' && !searchInput.value && props.modelValue.length > 0) {
    removeTag(props.modelValue[props.modelValue.length - 1]);
  }
};

// Close on outside click
const containerRef = ref<HTMLElement | null>(null);
onClickOutside(containerRef, () => { isOpen.value = false; });
</script>

<template>
  <div ref="containerRef" class="relative">
    <!-- Selected tags + input -->
    <div
      class="flex flex-wrap gap-1.5 items-center min-h-[38px] px-2.5 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-transparent focus-within:ring-2 focus-within:ring-primary/50 cursor-text"
      @click="inputRef?.focus(); isOpen = true"
    >
      <!-- Selected tag badges -->
      <span
        v-for="tag in selectedTags"
        :key="tag.id"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
        :style="{ backgroundColor: (tag.color || '#6366f1') + '1a', color: tag.color || '#6366f1' }"
      >
        <span
          class="w-1.5 h-1.5 rounded-full flex-shrink-0"
          :style="{ backgroundColor: tag.color || '#6366f1' }"
        />
        {{ tag.name }}
        <button
          @click.stop="removeTag(tag.id as string)"
          class="ml-0.5 hover:opacity-70"
        >
          <UIcon name="i-heroicons-x-mark" class="w-3 h-3" />
        </button>
      </span>

      <!-- Search input -->
      <input
        ref="inputRef"
        v-model="searchInput"
        @focus="isOpen = true"
        @keydown="handleKeydown"
        placeholder="Add tag..."
        class="flex-1 min-w-[80px] text-sm bg-transparent outline-none placeholder:text-muted-foreground"
      />
    </div>

    <!-- Dropdown -->
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen && (filteredTags.length > 0 || canCreateNew)"
        class="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-background border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg"
      >
        <!-- Category tags -->
        <div v-if="categoryResults.length > 0">
          <div class="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Categories
          </div>
          <button
            v-for="tag in categoryResults"
            :key="tag.id"
            @click="addTag(tag.id as string)"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
          >
            <span
              class="w-2.5 h-2.5 rounded-full flex-shrink-0"
              :style="{ backgroundColor: tag.color || '#6366f1' }"
            />
            <span class="flex-1 truncate">{{ tag.name }}</span>
          </button>
        </div>

        <!-- Entity tags -->
        <div v-if="entityResults.length > 0">
          <div class="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide" :class="{ 'border-t border-gray-100 dark:border-gray-700': categoryResults.length > 0 }">
            Linked Entities
          </div>
          <button
            v-for="tag in entityResults"
            :key="tag.id"
            @click="addTag(tag.id as string)"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
          >
            <span
              class="w-2.5 h-2.5 rounded-full flex-shrink-0"
              :style="{ backgroundColor: tag.color || '#6366f1' }"
            />
            <span class="flex-1 truncate">{{ tag.name }}</span>
            <span class="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
              {{ tag.entity_type }}
            </span>
          </button>
        </div>

        <!-- Create new tag -->
        <div v-if="canCreateNew" class="border-t border-gray-100 dark:border-gray-700">
          <button
            @click="createAndAdd"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left text-primary"
          >
            <UIcon name="i-heroicons-plus-circle" class="w-4 h-4" />
            Create "{{ searchInput.trim() }}"
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
