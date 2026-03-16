<template>
  <div class="space-y-3 p-3">
    <div v-for="field in schema" :key="field.key" class="space-y-1">
      <label class="text-xs font-medium text-foreground">
        {{ field.label }}
        <span v-if="field.required" class="text-destructive">*</span>
      </label>

      <!-- Color input -->
      <div v-if="field.type === 'color'" class="flex items-center gap-2">
        <input
          type="color"
          :value="getColorValue(field)"
          class="w-8 h-8 rounded border cursor-pointer shrink-0"
          @input="handleColorInput(field.key, ($event.target as HTMLInputElement).value)"
        />
        <input
          type="text"
          :value="getColorDisplay(field)"
          placeholder="transparent"
          class="flex-1 rounded-md border px-2 py-1 text-xs bg-background font-mono"
          @input="handleColorText(field.key, ($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="variables[field.key] && variables[field.key] !== 'transparent'"
          type="button"
          class="text-muted-foreground hover:text-foreground text-xs px-1"
          title="Reset to transparent"
          @click="emit('update', field.key, 'transparent')"
        >
          ✕
        </button>
      </div>

      <!-- Boolean toggle -->
      <div v-else-if="field.type === 'boolean'" class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="variables[field.key] === true || variables[field.key] === 'true'"
          class="rounded"
          @change="emit('update', field.key, ($event.target as HTMLInputElement).checked)"
        />
      </div>

      <!-- HTML textarea -->
      <textarea
        v-else-if="field.type === 'html'"
        :value="variables[field.key] || field.default || ''"
        rows="3"
        class="w-full rounded-md border px-2 py-1.5 text-xs bg-background font-mono resize-y"
        @input="debouncedEmit(field.key, ($event.target as HTMLTextAreaElement).value)"
      />

      <!-- URL / Image input -->
      <div v-else-if="field.type === 'url' || field.type === 'image'" class="space-y-1.5">
        <div class="relative flex items-center gap-1">
          <div class="relative flex-1">
            <input
              type="text"
              :value="variables[field.key] || field.default || ''"
              :placeholder="field.type === 'image' ? 'https://example.com/image.jpg' : 'https://example.com'"
              class="w-full rounded-md border px-2 py-1.5 text-xs bg-background pl-7"
              @input="debouncedEmit(field.key, ($event.target as HTMLInputElement).value)"
            />
            <span class="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">
              {{ field.type === 'image' ? '🖼' : '🔗' }}
            </span>
          </div>
          <button
            v-if="field.type === 'image'"
            type="button"
            class="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-md border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Browse organization images"
            @click="openImageBrowser(field.key)"
          >
            <Icon name="lucide:folder-open" class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Image preview thumbnail -->
        <div
          v-if="field.type === 'image' && (variables[field.key] || field.default)"
          class="mt-1"
        >
          <img
            :src="variables[field.key] || field.default"
            :alt="field.label"
            class="max-h-16 rounded border object-contain bg-muted"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
        </div>
      </div>

      <!-- Text input -->
      <input
        v-else
        type="text"
        :value="variables[field.key] || field.default || ''"
        :placeholder="field.description || field.label"
        class="w-full rounded-md border px-2 py-1.5 text-xs bg-background"
        @input="debouncedEmit(field.key, ($event.target as HTMLInputElement).value)"
      />

      <p v-if="field.description" class="text-[11px] text-muted-foreground">
        {{ field.description }}
      </p>
    </div>

    <div v-if="!schema?.length" class="text-xs text-muted-foreground py-2">
      This block has no configurable variables.
    </div>

    <!-- Image Browser Modal -->
    <NewsletterImageBrowserModal
      v-if="showImageBrowser && orgFolderId"
      :org-folder-id="orgFolderId"
      @select="handleImageSelect"
      @close="showImageBrowser = false"
    />
  </div>
</template>

<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core';
import type { BlockVariableDefinition } from '~/types/email/blocks';

const props = defineProps<{
  schema: BlockVariableDefinition[] | null;
  variables: Record<string, any>;
}>();

const emit = defineEmits<{
  update: [key: string, value: any];
}>();

const { currentOrg } = useOrganization();

// Image browser state
const showImageBrowser = ref(false);
const activeImageField = ref<string | null>(null);

// Get the org's root folder ID
const orgFolderId = computed(() => {
  const folder = currentOrg.value?.folder;
  if (!folder) return null;
  return typeof folder === 'object' ? (folder as any).id : folder;
});

function openImageBrowser(fieldKey: string) {
  if (!orgFolderId.value) {
    // Fallback: if no org folder, show an alert
    console.warn('No organization folder configured');
    return;
  }
  activeImageField.value = fieldKey;
  showImageBrowser.value = true;
}

function handleImageSelect(url: string) {
  if (activeImageField.value) {
    emit('update', activeImageField.value, url);
  }
  showImageBrowser.value = false;
  activeImageField.value = null;
}

/** Debounced emit for text-heavy inputs to avoid lag */
const debouncedEmit = useDebounceFn((key: string, value: any) => {
  emit('update', key, value);
}, 300);

/** Get a valid hex color for the native color picker (transparent → #000000). */
function getColorValue(field: BlockVariableDefinition): string {
  const val = props.variables[field.key] || field.default || '';
  if (!val || val === 'transparent') return '#000000';
  return val;
}

/** Get the text display for the color text input. */
function getColorDisplay(field: BlockVariableDefinition): string {
  const val = props.variables[field.key];
  if (val === 'transparent' || val === '') return '';
  return val || field.default || '';
}

/** Handle color picker input — never emit empty strings. */
function handleColorInput(key: string, value: string) {
  emit('update', key, value || 'transparent');
}

/** Handle color text input — fall back to transparent for empty. */
function handleColorText(key: string, value: string) {
  const trimmed = value.trim();
  debouncedEmit(key, trimmed || 'transparent');
}
</script>
