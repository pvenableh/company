<template>
  <div class="space-y-3 p-3">
    <!-- Quick color presets (shown when block has 2+ color variables) -->
    <div v-if="colorFields.length >= 2" class="space-y-1.5">
      <label class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Colors</label>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="preset in colorPresets"
          :key="preset.name"
          type="button"
          class="group flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium transition-all hover:shadow-sm hover:border-foreground/20"
          :title="`Apply ${preset.name} palette`"
          @click="applyColorPreset(preset)"
        >
          <span class="flex gap-0.5">
            <span
              v-for="(c, ci) in preset.preview"
              :key="ci"
              class="w-3 h-3 rounded-full border border-black/10"
              :style="{ backgroundColor: c }"
            />
          </span>
          <span class="text-muted-foreground group-hover:text-foreground">{{ preset.name }}</span>
        </button>
      </div>
    </div>

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

// Color preset system
interface ColorPreset {
  name: string;
  preview: string[];
  mapping: Record<string, string>; // pattern → color
}

const colorFields = computed(() =>
  (props.schema || []).filter((f) => f.type === 'color'),
);

const colorPresets: ColorPreset[] = [
  {
    name: 'Classic',
    preview: ['#1a1a2e', '#e94560', '#f5f5f5'],
    mapping: { text: '#1a1a2e', background: '#f5f5f5', bg: '#f5f5f5', accent: '#e94560', button: '#e94560', link: '#e94560', heading: '#1a1a2e', border: '#dddddd' },
  },
  {
    name: 'Modern',
    preview: ['#2d3436', '#6c5ce7', '#f8f9fa'],
    mapping: { text: '#2d3436', background: '#f8f9fa', bg: '#f8f9fa', accent: '#6c5ce7', button: '#6c5ce7', link: '#6c5ce7', heading: '#2d3436', border: '#e0e0e0' },
  },
  {
    name: 'Casual',
    preview: ['#2d3436', '#fd79a8', '#ffeaa7'],
    mapping: { text: '#2d3436', background: '#ffffff', bg: '#ffeaa7', accent: '#fd79a8', button: '#fd79a8', link: '#e84393', heading: '#2d3436', border: '#fdcb6e' },
  },
  {
    name: 'Clean',
    preview: ['#333333', '#0984e3', '#ffffff'],
    mapping: { text: '#333333', background: '#ffffff', bg: '#ffffff', accent: '#0984e3', button: '#0984e3', link: '#0984e3', heading: '#333333', border: '#e8e8e8' },
  },
  {
    name: 'Bright',
    preview: ['#2d3436', '#e17055', '#00b894'],
    mapping: { text: '#2d3436', background: '#ffffff', bg: '#ffffff', accent: '#e17055', button: '#00b894', link: '#e17055', heading: '#2d3436', border: '#dfe6e9' },
  },
  {
    name: 'Dark',
    preview: ['#f5f5f5', '#a29bfe', '#2d3436'],
    mapping: { text: '#f5f5f5', background: '#2d3436', bg: '#1e272e', accent: '#a29bfe', button: '#a29bfe', link: '#74b9ff', heading: '#ffffff', border: '#636e72' },
  },
  {
    name: 'Warm',
    preview: ['#2d3436', '#e17055', '#fab1a0'],
    mapping: { text: '#2d3436', background: '#ffffff', bg: '#ffeaa7', accent: '#e17055', button: '#e17055', link: '#d63031', heading: '#2d3436', border: '#fab1a0' },
  },
  {
    name: 'Corporate',
    preview: ['#2c3e50', '#2980b9', '#ecf0f1'],
    mapping: { text: '#2c3e50', background: '#ecf0f1', bg: '#ffffff', accent: '#2980b9', button: '#27ae60', link: '#2980b9', heading: '#2c3e50', border: '#bdc3c7' },
  },
];

function applyColorPreset(preset: ColorPreset) {
  for (const field of colorFields.value) {
    const key = field.key.toLowerCase();
    // Match field key against preset mapping patterns
    let matched = false;
    for (const [pattern, color] of Object.entries(preset.mapping)) {
      if (key.includes(pattern)) {
        emit('update', field.key, color);
        matched = true;
        break;
      }
    }
    // Fallback: if no pattern matched, use text color for text-like, accent for others
    if (!matched) {
      if (key.includes('color') || key.includes('font')) {
        emit('update', field.key, preset.mapping.text);
      } else {
        emit('update', field.key, preset.mapping.accent);
      }
    }
  }
}

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
  const raw = props.variables[field.key] || field.default || '';
  const val = typeof raw === 'string' ? raw.trim() : '';
  if (!val || val === 'transparent') return '#000000';
  // Ensure valid hex format for native color input
  if (/^#[0-9a-fA-F]{6}$/.test(val)) return val;
  if (/^#[0-9a-fA-F]{3}$/.test(val)) {
    // Expand shorthand #abc → #aabbcc
    return `#${val[1]}${val[1]}${val[2]}${val[2]}${val[3]}${val[3]}`;
  }
  return '#000000';
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
