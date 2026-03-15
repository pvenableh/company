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

      <!-- URL input -->
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
            title="Browse or upload image"
            @click="toggleFilePicker(field.key)"
          >
            <Icon name="lucide:folder-open" class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- File picker dropdown for image fields -->
        <div
          v-if="field.type === 'image' && activePickerField === field.key"
          class="rounded-md border bg-background shadow-md overflow-hidden"
        >
          <!-- Upload button -->
          <div class="p-2 border-b">
            <label
              class="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 rounded-md border border-dashed text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer transition-colors"
            >
              <Icon name="lucide:upload" class="w-3.5 h-3.5" />
              <span>{{ isUploading ? 'Uploading...' : 'Upload image' }}</span>
              <input
                type="file"
                accept="image/*"
                class="hidden"
                :disabled="isUploading"
                @change="handleImageUpload(field.key, $event)"
              />
            </label>
          </div>

          <!-- Recent files list -->
          <div class="max-h-40 overflow-y-auto">
            <div v-if="isLoadingFiles" class="p-3 text-center text-xs text-muted-foreground">
              Loading files...
            </div>
            <div v-else-if="recentImageFiles.length === 0" class="p-3 text-center text-xs text-muted-foreground">
              No image files found
            </div>
            <button
              v-for="file in recentImageFiles"
              :key="file.id"
              type="button"
              class="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors"
              @click="selectFile(field.key, file)"
            >
              <img
                :src="getFileThumbnail(file.id)"
                :alt="file.title || file.filename_download"
                class="w-8 h-8 rounded object-cover bg-muted shrink-0"
              />
              <span class="truncate text-foreground">{{ file.title || file.filename_download }}</span>
            </button>
          </div>
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

const config = useRuntimeConfig();
const { list: listFiles, upload: uploadFile, getUrl: getFileUrl } = useDirectusFiles();

/** File picker state */
const activePickerField = ref<string | null>(null);
const recentImageFiles = ref<any[]>([]);
const isLoadingFiles = ref(false);
const isUploading = ref(false);

/** Toggle file picker for a given field */
async function toggleFilePicker(fieldKey: string) {
  if (activePickerField.value === fieldKey) {
    activePickerField.value = null;
    return;
  }
  activePickerField.value = fieldKey;
  await fetchRecentImages();
}

/** Fetch recent image files from Directus */
async function fetchRecentImages() {
  isLoadingFiles.value = true;
  try {
    const files = await listFiles({
      filter: { type: { _starts_with: 'image/' } },
      fields: ['id', 'title', 'filename_download', 'type'],
      sort: ['-uploaded_on'],
      limit: 20,
    });
    recentImageFiles.value = Array.isArray(files) ? files : [];
  } catch (err) {
    console.error('Failed to fetch files:', err);
    recentImageFiles.value = [];
  } finally {
    isLoadingFiles.value = false;
  }
}

/** Get a small thumbnail URL for a Directus file */
function getFileThumbnail(fileId: string): string {
  return `${config.public.directus.url}/assets/${fileId}?width=64&height=64&fit=cover&quality=70`;
}

/** Select a file from the picker */
function selectFile(fieldKey: string, file: any) {
  const url = `${config.public.directus.url}/assets/${file.id}`;
  emit('update', fieldKey, url);
  activePickerField.value = null;
}

/** Handle image upload from the file input */
async function handleImageUpload(fieldKey: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  isUploading.value = true;
  try {
    const uploaded = await uploadFile(file, {
      title: file.name,
    }) as any;
    if (uploaded?.id) {
      const url = `${config.public.directus.url}/assets/${uploaded.id}`;
      emit('update', fieldKey, url);
      // Refresh the file list so the new file appears
      await fetchRecentImages();
    }
  } catch (err) {
    console.error('Image upload failed:', err);
  } finally {
    isUploading.value = false;
    input.value = '';
  }
}

/** Debounced emit for text-heavy inputs to avoid lag */
const debouncedEmit = useDebounceFn((key: string, value: any) => {
  emit('update', key, value);
}, 300);

/** Immediate emit for discrete inputs (color picker, checkboxes) */
function emitImmediate(key: string, value: any) {
  emit('update', key, value);
}

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
  emitImmediate(key, value || 'transparent');
}

/** Handle color text input — fall back to transparent for empty. */
function handleColorText(key: string, value: string) {
  const trimmed = value.trim();
  debouncedEmit(key, trimmed || 'transparent');
}
</script>
